# Phase 0 — architecture map and baseline

**Date:** 2026-08-11 · **HEAD at audit:** `0debb4e0` · **Branch:** `mappedout-branding`

Produced by four parallel read-only audits plus direct measurement. This is the
evidence base for Phases 1–9. Every claim below has a file:line behind it.

## Baseline (measured, not estimated)

| Measure | Value |
|---|---|
| Test suite | 24 suites / 411 tests passing |
| Prisma models | 74 (schema 1,670 lines) |
| Client JS shipped | **30 MB across 166 chunks** (production build) |
| Largest chunks | six at 2.5 MB; one identified as Polotno (design editor) |
| Unguarded optional-chain array ops | 42 across 28 files |
| Largest component | `calendar.tsx` 1,453 lines |

## 1. Calendar crash — root cause

**`apps/backend/src/api/routes/integrations.controller.ts:149` — `time: JSON.parse(p.postingTimes)`**

`Integration.postingTimes` is a plain `String` column. The parse is unguarded, so a
row containing *valid but non-array* JSON (`'{}'`, `'null'`, `'5'`) returns **HTTP 200**
with a well-formed `{ integrations: [...] }` envelope in which one item has
`time: {}`.

That is precisely the shape `0e728890` does not catch. That commit guaranteed the
**outer** arrays (`integrations`, `posts`, `sets`, `listPosts`) via `asArray`/`pluckArray`,
and its own message states it declined a repo-wide sweep as "a larger refactor —
deliberately not claimed". So the envelope is validated and the nested field is not.

Confirmed consumers of the unvalidated field:
- `apps/frontend/src/components/launches/calendar.tsx:289` — `p.time.flatMap(...)`, inside `DayView` (verified: `DayView` begins at line 262; `WeekView` at 343 does not read `.time`).
- `apps/frontend/src/components/launches/time.table.tsx:43` — `[...time]`, throws "not iterable".
- `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts:757` — `JSON.parse(current.postingTimes).map(...)` in `findFreeDateTime`, 500s `/posts/find-slot`.

Same unguarded-parse pattern on `additionalSettings` (`integrations.controller.ts:153`)
consumed at `settings.modal.tsx:45` and `high.order.provider.tsx:150,173,231,302,315`.

**Not the cause, checked:** the `/posts/list` minified-envelope trap. Both callers
(`calendar.context.tsx:230,245`) correctly call `expandPosts`/`expandPostsList` first.

**Open:** the production error is `_?.filter is not a function` — an *optional-chained*
`.filter`, which none of the confirmed sites use. Only six `?.filter(` sites exist and
none is on the default (week) render path. The exact firing line is unconfirmed;
the normalization boundary below fixes the class regardless.

**Validators already available — do not add one:** `zod@3.25.76`, `yup@1.4.0`,
`class-validator@0.14.1` (+ global `ValidationPipe`, `main.ts:94`).

## 2. Composer — four uncoordinated client states

1. `Customer` / `SelectCustomer` (`select.customer.tsx:14-124`) — legacy agency model.
2. **DBU external client** — local React state in `dbu.association.panel.tsx:82-84`, resolved from an external HMAC webhook, never reconciled with (1).
3. `dbuActive` / `contentType` mirrored into Zustand (`store.ts:44-51`), derived from (2).
4. `CaptionTools` derives its **own** `customerId` (`caption.tools.tsx:74-80`) from (1) only — so in a DBU post the AI reasons about the wrong client.

`Customer.dbuClientId` (`schema.prisma:358-359`) exists as the bridge between (1) and
(2) and is **never read anywhere** — the reconciliation was designed and never wired.

**The real bug:** both `SelectCustomer.changeCustomer` (`manage.modal.tsx:196-209`) and
`DbuAssociationPanel`'s `resolveDbuChannels` (`manage.modal.tsx:149-151`) write the same
Zustand `selectedIntegrations` array through uncoordinated paths. **Last writer wins**,
silently discarding the other's selection.

Other findings:
- `Campaign.customerId` exists (`schema.prisma:503`) and the campaign list query ignores it (`campaigns.service.ts:16`) — campaigns from every client are offered.
- Media has **no** client scoping at any layer, and `Media` has no client column.
- Timezone is `localStorage` only (`set.timezone.tsx:11-16`); the settings UI that sets it is **commented out** (`metric.component.tsx:49-58`). Two devices produce different UTC instants for the same typed time.
- **`Post` has no `customerId`.** Client association is derivable only via `post.integration.customerId` or `post.dbuClientId` — two unreconciled paths. This is the upstream cause of fuzzy campaign/report association.

**Authorization gap:** `createPost` (`posts.controller.ts:235-280`) never calls
`assertPostInScope`/`getScope`, which six other handlers in the same controller do use
(lines 81, 91, 102, 118, 223, 324). It verifies the integration belongs to the *org*,
not to the *caller's assigned scope*. `campaignId` and the `dbu` object are trusted
unvalidated.

## 3. Analytics — nothing is persisted

**There is no Postgres table holding any platform metric.** Confirmed across all 74
models. Every number in the product is fetched live per request and cached to Redis
only: `checkAnalytics` EX 3600 (`integration.service.ts:579-586`), `getTopPosts` EX 900
(`:271`), `checkPostAnalytics` EX 3600 (`posts.service.ts:244-251`).

Consequence: **trend analysis beyond the Redis TTL is impossible**, and any window the
platform API no longer serves is gone.

- `Post.releaseId` is the only field resembling a platform post id. It is **not unique** (no `@unique`, no `@@unique`) and is written only by Mapped Out's own publish worker (`posts.repository.ts:491-504`).
- `CreationMethod` (`schema.prisma:1181-1188`) has no value meaning "observed on the platform" — every value implies Mapped Out created it.
- **No import/sync/ingest path exists** for externally-published content.
- `topPosts` is implemented by **Instagram only** — every other provider has `analytics`/`postAnalytics` but no `topPosts`. So "Top Posts" and "Best Times" are Instagram-only in practice.
- Posting-pattern heatmap (`analytics.aggregate.ts:168-180`) is fed **Mapped Out's own `Post` rows**, not platform data — exactly the complaint. No sample-size guard.
- Best times (`best.times.ts`) *does* use platform data and *does* guard `MIN_SAMPLES=3`, but the frontend caps input to the top 10 posts by reach before calling it (`reports.component.tsx:221-225`).
- `analytics.aggregate.ts` is sound: `available:false` is excluded rather than zeroed, followers take the last value rather than summing, and no double-count path was found.

**Queue architecture: Temporal only.** No BullMQ/bull/agenda dependency; Redis is cache
only. Periodic work uses an infinite-sleep-loop workflow started at boot behind
`RUN_CRON` (`infinite.workflow.register.ts:9-23`). A platform-sync job belongs there.

**Campaigns** attach posts by `group`, not post id (`campaigns.repository.ts:136-146`),
and `assignablePosts` filters only by org — no state filter, so drafts are assignable.
No technical barrier to assigning an external post; the barrier is that no external
post can exist.

## Implications for the phase order

- Phase 1 must fix the **read boundary**, not the call sites — 42 scattered `Array.isArray` checks is the anti-pattern the brief forbids.
- Phase 3 cannot unify the composer without deciding the canonical client model, because `Customer` and the DBU client are genuinely two different things today.
- Phases 4–6 all depend on one new thing: a persisted, deduplicated record of platform content. Nothing downstream is fixable without it.
- Part 15 performance work has an obvious first target: 30 MB of client JS, with the design editor shipped as a 2.5 MB chunk.
