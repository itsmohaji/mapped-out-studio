# AI Assistant redesign — threads, folders, and starter cards

**Date:** 2026-08-05
**Branch:** `mappedout-branding`
**Status:** design approved, not yet planned

## Problem

The AI Assistant page opens with eight equally-weighted capability cards, preceded by
two dropdowns, a paragraph of explanation and a credit counter. The owner's diagnosis
was specific: **too many choices up front**. Naming, flow and output depth were all
judged fine.

A wall of equal options is a decision, not a start. The page reads as developer tooling
rather than an assistant.

Today it is used by the Mapped Out team. It will later be sold as SaaS, so it has to
demo well without being rebuilt.

## Non-goals

- **Not** opening AI to the `CLIENT` role. Neither AI controller carries
  `@ClientAllowed()`, and per ADR-006 CLIENT is default-deny. That stays true.
- **Not** changing the capability registry's briefs, sections or output contract.
  Phase 2 (`cfb7e45e`) shipped those and they are working.
- **Not** a second conversational surface. The ⌘K spotlight already exists; this design
  makes the two share one history rather than compete.
- **Not** rebuilding caption generation. It already lives in the composer and already
  reads attached media.

## Decisions

### D1 — The page becomes a chat with persistent threads

Rejected: keeping cards and merely showing fewer (fixes the count, not the feeling);
grouping eight into three buckets (adds a click, buckets are arbitrary).

The owner chose a Claude/ChatGPT-shaped surface with a folder library. Cards remain, but
as *starters* above the composer rather than as the page's content.

### D2 — Cards name the finding, not the capability

"Tuesday's Reel underperformed" with `Recommendation` as a small type label, rather than
a card titled "Performance Insights". Same machinery, different framing. This is what
stops the page reading as a menu.

Each card carries a type label bottom-left and a verb bottom-right (Recommendation/Open,
Campaign/Start, Content ideas/Ask).

### D3 — Exactly one filled card

Only the recommendation is accent-filled, because it is the only card containing a
*finding* — the others are invitations. The design system allows one accent-filled
element per view. Additional recommendations go to the Recommendations folder.

### D4 — Two click behaviours: assisted and automatic

- **Assisted** (Campaign, Content ideas): clicking writes an *editable* message into the
  composer with `[placeholder]` gaps, and the channel picker stays active. The operator
  edits and chooses scope before sending.
- **Automatic** (Recommendation): one click opens the answer. No channel picker — the
  finding already names the post and the channel, and asking would pretend it does not
  know.

This replaces an earlier proposal for a three-question wizard. Editing one prefilled
sentence is fewer steps than answering three questions.

### D5 — Capabilities declare their surface

Add `surface: 'assistant' | 'composer'` to `CapabilitySpec` in
`libraries/helpers/src/utils/ai.capabilities.ts`. `write_captions` is `composer`; the
rest are `assistant`.

Caption AI must not appear on the assistant page — it belongs where the media is, in the
composer, which is the only place it can actually see the image or video. Declaring the
surface rather than filtering in the page component means it cannot drift back later.
Same single-source-of-truth pattern as ADR-028.

`analyze_account` is removed from the assistant page: account health belongs on the
Accounts page. It is a working capability, so it is **relocated, not deleted** — the
`surface` field gains `'account'` for it, or it is left `assistant` until the Accounts
page can host it. Decide during planning; do not delete.

### D6 — The card states only what arithmetic proves

A model is never asked whether a post underperformed. Noticing is arithmetic over
measured analytics. The AI is invoked only when the card is opened, to explain *why* and
what to do.

This is ADR-028's line redrawn: a figure a platform did not report is not measured, and a
headline number must never be a model's assertion.

### D7 — One history, two doors

⌘K stays fast and in-place, but its exchange is saved as a thread in Recent. The page is
the deep surface over the same threads.

Rejected: leaving ⌘K ephemeral (people learn the spotlight is only for throwaway
questions, and you have two assistants with different memories); making ⌘K a launcher
that navigates to the page (reintroduces the leaving-the-page problem that the spotlight
was built to solve).

The cost is small because the thread store is being built for the page regardless.

### D8 — Credits are present but silent

A small ring under the composer, Claude Code style; click to expand into usage. Consistent
with ADR-030 — the balance stays off the spotlight, and lives here, beside the work that
spends it.

## Data model

Three new tables. No column changes to existing models, so ADR-008 (additive-only,
`prisma db push` on every boot) holds.

```
AiThread
  id, organizationId, customerId?, title,
  folderId?          -- a thread is in at most one folder
  createdBy, createdAt, updatedAt

AiMessage
  id, threadId, role ('user' | 'assistant'), text,
  sections?          -- Json: RenderedSection[] when produced by a capability
  capabilityKey?, createdAt

AiFolder
  id, organizationId, name, sortOrder, createdAt
```

**No join table.** A thread belongs to at most one folder, so `folderId` on the thread is
sufficient.

**`sections` is the load-bearing column.** When a message came from a capability run it
stores the `RenderedSection[]` that `parseStructured()` already produces, so
`ai-assist/answer.tsx` renders it unchanged. A plain chat reply has `text` and no
sections. The structured-output work from `cfb7e45e` becomes the *content* of threads
rather than a separate feature.

**Threads do not replace `AiRun`.** `AiRun` remains the audit and billing record — spend,
provider, skills. `AiThread` is the human-facing layer. Conflating them would put
user-editable titles on an audit trail.

Folders seed as Campaigns, Content ideas and Recommendations per organization on first
use; renameable, addable, deletable thereafter. Deleting a folder must not delete its
threads — they return to Recent.

## Page layout

- **No greeting.** The dashboard already greets; repeating it is noise.
- **Three starter cards** across the top (D2, D3, D4).
- **Composer** below, with channel scope selector, attach, send.
- **Credit ring** under the composer (D8).
- **Folder sidebar on the right** — Recent plus folders, each with a count. Drag a thread
  onto a folder to file it; double-click a folder to rename; a folder-plus control adds
  one.

## Recommendation sourcing — the phasing constraint

`postAnalytics()` in `posts.service.ts` fetches per-post metrics **live from each
provider on demand** and caches them to Redis with a TTL. There is **no Postgres table of
historical post metrics**, so there is no baseline to compute a trend against, and doing
it at page load would cost one provider call per post per visit against rate limits.

This splits delivery:

**Phase A — threads, folders, chat, cards.** The Recommendation card runs on click like
any other capability. No proactive finding. Everything else in this document ships.

**Phase B — proactive recommendations.** Add a per-post metric snapshot table and a
Temporal job that records metrics on a schedule. Only then can the card state a measured
comparison. Until Phase B lands, the filled card slot is occupied per the fallback below.

Phase B is not designed here. It needs its own spec.

## Empty and degraded states

- **No finding available** (always, until Phase B; and afterwards whenever nothing stands
  out): the filled slot takes a different card that works without analytics — Content
  ideas or Monthly planner. Never a hedged non-recommendation, never a fabricated one.
- **No analytics reporting at all**: capabilities flagged `needsAnalytics` already refuse
  with a client-safe message via `hasEnoughData()` (ADR-028). Cards for them show that
  reason rather than a dead button.
- **Model returns off-contract**: `parseStructured()` already falls back to raw text
  flagged `degraded`. Unchanged.
- **Provider unavailable**: the existing "assistant is unavailable right now" path.

## Error handling

- A failed send still records the user's message in the thread — a question worth retrying
  is exactly the one whose answer failed. This mirrors the spotlight's existing
  record-on-ask behaviour.
- Thread, folder and message writes are org-scoped and re-checked server-side. A
  `threadId` or `folderId` from another organization is refused, never silently ignored —
  the same rule the existing `customerId` handling follows.
- Drag-and-drop is optimistic in the UI with a revert on failure.

## Testing

- Pure helpers (thread titling, card selection, folder seeding) get unit tests alongside
  the existing `ai.*.spec.ts` suites.
- `surface` filtering gets a test asserting `write_captions` never appears in the
  assistant set — the drift guard, matching the ADR-028 pattern.
- Org-scoping of thread and folder access gets a boundary test alongside
  `ai.orchestra.boundary.spec.ts`.
- ⚠️ **`@nx/*` is not installed**, so `pnpm test` and ESLint cannot run in this checkout.
  Run `pnpm install` before relying on them. See `MappedOut — Known Issues`.

## Open questions

1. Does `analyze_account` move to the Accounts page in this work, or stay put with a
   `surface` value until that page can host it?
2. Should a thread be shareable with a client, or is it strictly internal? Affects whether
   `AiThread` needs a visibility field now (cheaper to add than to retrofit).
3. Folder deletion when non-empty — confirm threads return to Recent rather than being
   deleted.
