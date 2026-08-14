# Mapped Out — Handoff

> **Read this first.** Written 2026-08-14. It is self-contained: you can work from this file
> alone if the Obsidian vault is not on this machine.
>
> The owner is **not a developer**. Explain in plain language. Do not hand him diagnostics to run
> unless there is genuinely no alternative. Decide small things yourself; stop only for
> destructive or high-impact actions.

---

## ⏭️ START HERE

1. **Ask whether he clicked "Link them" on <https://social.mappedout.co/clients>.**
   Most of Phase 3 is blocked on it. If that panel is gone from the page, it was applied.
2. **If applied** → next task is `Post.customerId` (needs a Prisma migration + backfill —
   plan it WITH him, never run it as a side effect).
3. **If not applied** → do not nag. Pick up the unblocked items in "Phase 3 remaining" below.

## 🔴 Two things wait on the owner

| What | Why it matters |
|---|---|
| **The "Link them" button on `/clients`** | Records `Customer.dbuClientId`. His dry run read **2 links** (Mapped Out, Époque), **0 creates**, **0 conflicts**, 2 channels untouched. Clicking writes two id values, creates nothing. Safe to click twice. |
| **`ENCRYPTION_KEY` in Coolify** | Still unset. Harmless today (falls back to `JWT_SECRET`), **but `JWT_SECRET` must NOT be rotated until it is set** — rotating would make every stored social token undecryptable and disconnect every channel. He must copy `JWT_SECRET`'s value into a new `ENCRYPTION_KEY` variable. **The Coolify API returns env metadata only, never values, so you cannot read the secret to copy it yourself. Never invent a value.** |

## Where things actually live

| Thing | Path / URL |
|---|---|
| **App code** (all of it) | `~/Desktop/mapped-out-studio` · GitHub `itsmohaji/mapped-out-studio` · branch **`mappedout-branding`** |
| **Infra** (compose only, no app code) | `~/Desktop/mapped-out-infra` · GitHub `itsmohaji/postiz-production` · branch **`main`** |
| **Docs / knowledge base** | `~/Documents/Obsidian Vault` · GitHub `itsmohaji/dbu-knowledge-base` · folder `30-MappedOut/` |
| **Production** | <https://social.mappedout.co> — health check is `/api/` **with the trailing slash** |
| **Coolify token** | `~/.coolify_token` (app uuid `pu53f10y6ml47hc3t88mdrs7`) |

⛔ **There is no local environment.** Production is the only environment. `:3000` belongs
permanently to the AIM project; Mapped Out's backend wants the same port. Do not try to run it.
Verify with `pnpm run build:frontend` + `pnpm run build:backend` + `pnpm test`, then deploy and
look at the live site.

## Deploy — the procedure that actually works

```
1. push to mappedout-branding
2. WAIT for "Build Mapped Out Image" to go green (~5-6 min):  gh run list --branch mappedout-branding
3. FORCE deploy:  POST https://coolify.dbugroup.net/api/v1/deploy?uuid=pu53f10y6ml47hc3t88mdrs7&force=true
   (Bearer token from ~/.coolify_token)
4. poll /api/v1/deployments/{deployment_uuid} until "finished"
5. if /api/ returns 502 that is the known zombie:
   POST /api/v1/applications/pu53f10y6ml47hc3t88mdrs7/restart   (~90s, then 200)
```

- **`force=true` matters.** A plain redeploy reuses the cached image and changes nothing.
- The `:mappedout` image tag is mutable — without a redeploy the container keeps the old image.
- **The image build fails sometimes for reasons that are not your code.** `next/font/google`
  downloads Plus Jakarta Sans from `fonts.gstatic.com` at build time; on 2026-08-14 it 404'd and
  failed the build. `gh run rerun <id> --failed` passed. Fixing it properly = `next/font/local`.

## Verifying a deploy landed (traps that cost a full day)

- ✅ **Take the failing chunk URL from the browser console stack → `curl` it → read the code at the
  reported `line:column`.** That is the real deployed source. Chunks are public, no auth needed.
- ✅ **Route existence:** a removed route returns **404** while a live one returns **401**. That
  contrast proved the Phase 2 backend was live without any session.
- ❌ **Do NOT fingerprint `/auth` chunk hashes to detect a change elsewhere.** The login page
  imports no dashboard code, so its hashes are identical before and after. This produced a false
  "it's deployed" claim once already.
- ❌ **Dashboard chunk filenames are not discoverable without a session**, so the curl trick only
  verifies public routes.
- ⚠️ **There is no usable browser session for automated checks.** His Chrome holds only 4 non-auth
  cookies for the domain, so `browse cookie-import-browser` cannot borrow one, and `browse handoff`
  times out (the headed Chromium does spawn; `browse resume` then works). In practice: ask him, or
  ask for a screenshot.

## State as of 2026-08-14 — HEAD `be2c4861`, deployed, 496 tests green

**Calendar — closed.** Two bugs, both owner-confirmed fixed:
- The crash (`_.filter is not a function`): nine components each read `/integrations/list` by hand.
- Channels/clients vanishing when navigating between sections: **eight components registered the
  same SWR key `/integrations/list` with different fetchers.** SWR keeps one cache entry per key and
  dedupes by key regardless of fetcher, so whichever page loaded first decided the shape everyone
  got. Guarded by `apps/frontend/src/components/launches/helpers/integration.list.key.spec.ts`,
  which fails the build if a second module ever registers that key.

**Phase 2 (security) — closed and deployed.**
| Commit | Fix |
|---|---|
| `54ae0cd2` | Every JWT carries a `purpose`; a password-reset token was previously a permanent session. Reset links are single-use and expire for real. HS256 pinned. |
| `19cdd339` | Platform-wide AI settings need a **platform** owner (`SUPERADMIN_EMAILS`), not an org role. Fails closed. |
| `32a59292` | `/analytics/post/:postId` scoped per user; `/enterprise/*` unmounted (unauthenticated, and one route deleted a channel plus all its posts). |
| `859a2f94` | `ENCRYPTION_KEY` separated from `JWT_SECRET` so the session secret is rotatable. |

⚠️ **Legacy predicates in `auth.middleware.ts` and `getOrgFromCookie` readmit purpose-less tokens
by shape, so nobody was logged out. Delete them once existing cookies have turned over.**

**Phase 3 (composer + client model) — part done, deployed.**
- 🧭 **The canonical client model is `Customer` (Mapped Out's own client). DBU is an OPTIONAL LINK
  on top, via `Customer.dbuClientId`.** Owner's reasoning, 2026-08-14: today it is internal and
  DBU-connected, but **it becomes a SaaS where each agency has its own clients and DBU is not
  involved at all** — so DBU cannot be the source of truth. It also matches authorization, which
  already keys `UserAssignment` on `Customer`. (This reversed the recommendation first put to him.)
- `e49fd05d` — **`POST /posts` ran no scope check at all** while six by-id handlers on the same
  controller did: a Manager could publish to another client's channel by id. Also stopped
  `campaignId` connecting to a campaign in any other organisation.
- `40fc486a` — the composer's two client pickers no longer silently overwrite each other. The
  dangerous case was a post publishing to one client's channels while filed in DBU against another.
- `31eeba42` + `be2c4861` — dry run and apply for the client↔DBU link, on `/clients`.

### Phase 3 remaining
| Task | Blocked on the link? |
|---|---|
| **`Post.customerId`** — client association is derivable only via `post.integration.customerId` OR `post.dbuClientId`, two unreconciled paths. Upstream cause of fuzzy campaign/report association. **Needs a migration + backfill; plan it with him.** | yes |
| `Campaign.customerId` exists (`schema.prisma:503`) and the list query ignores it (`campaigns.service.ts:16`) — every client's campaigns are offered. | yes |
| `CaptionTools` derives its own `customerId` from the channel's Customer (`ai-assist/caption.tools.tsx:74-80`). This becomes **correct on its own** once the link is applied — re-check, do not "fix" it now. | yes |
| Media has **no** client scoping at any layer; `Media` has no client column. | **no** |
| Timezone is `localStorage` only (`set.timezone.tsx:11-16`) and its settings UI is **commented out** (`metric.component.tsx:49-58`) — two devices produce different UTC instants for the same typed time. Self-contained; good pick-up-anytime task. | **no** |

### Also noticed, not yet work
`Époque` shows **0 of 1** channels connected and `DBU Group` **1 of 2** — channels needing
reconnection, so posts to them would fail. Offered; he had not answered when he stopped.

## Phases 4+ — read this before planning them

From the Phase 0 audit (`docs/audit/2026-08-11-phase-0-architecture-map.md`):
**no platform metric is persisted anywhere** (all 74 models checked). Analytics are fetched live and
cached to Redis for 15–60 minutes. So Parts 4–7 are "build the missing storage layer", NOT "fix the
queries". Also: `topPosts` is Instagram-only, and there is 30 MB of client JS across 166 chunks
(the design editor alone is a 2.5 MB chunk) — the measured cause of "feels heavy".

## House rules that keep being relearned

- Fix **root causes**, not symptoms. If a shared helper is wrong, fix the helper, not the callers.
- **Never claim something works because tests pass.** Close the loop on the real page.
- Both builds must pass: `pnpm run build:frontend` AND `pnpm run build:backend`, plus `pnpm test`.
- Only **pnpm**. Never add a frontend component from npm — write it natively.
- Backend layering: Controller → Service → Repository, no shortcuts.
- Schema deploys via `prisma db push` on boot → **additive / nullable changes only.**
- The upstream product name must never appear in any user-facing surface.
- Update the Obsidian vault as part of finishing work — he should never have to ask.

## Getting the knowledge base on this machine

The vault has the full detail (ADRs, known issues, security posture, technical debt):

```bash
git clone https://github.com/itsmohaji/dbu-knowledge-base.git ~/Documents/Obsidian\ Vault
# already cloned? just:
git -C ~/Documents/Obsidian\ Vault pull
```

Start with `30-MappedOut/MappedOut — Project Overview.md` → its **Current Status** section is the
same handoff as this file. Then `Architecture`, `Business Rules`, `Known Issues`, `TODO`.
**The vault is more current than any other doc in this repo.**
