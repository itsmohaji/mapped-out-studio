# Settings Overhaul — Design Spec

> **Repo:** fork `~/Desktop/postiz-app`, branch `mappedout-branding`.
> **Date:** 2026-07-27. **Author:** Claude (Opus 4.8), for owner review.
> **Workstream:** #1 of the Mapped Out finishing backlog (Settings first, then Analytics/Dashboard,
> Campaigns/Calendar, Account-module/AI). **No code until the owner approves this spec.**
> **Locked decisions:** (1) Arabic = **full RTL mirroring**, delivered progressively. (2) AI API keys =
> **org-level, admin-set, encrypted at rest**.

## 1. Goal

Make Settings a complete, production-ready surface with seven capabilities, built as **small verified
slices** (schema → API → UI → build-verify → deploy → owner review), never one big drop. Every piece is
real and works against live data (owner's hard rule: no mockups, no fake numbers). Nothing here may weaken
auth, authorization, security, error handling, accessibility, audit logging, tests, migrations, DBU
compatibility, or publishing reliability (ponytail guardrail).

## 2. Current state (verified in code, 2026-07-27)

Settings shell = `apps/frontend/src/components/layout/settings.component.tsx`, a tabbed popup. Existing tabs:
`global_settings`, `appearance` (Theme toggle + `LanguageComponent`), `teams`, `webhooks`, `autopost`,
`sets`, `signatures`, `api` (API & Developers), `approved_apps` (Connected Apps). Tabs are gated by
`user.tier` / permissions.

- **i18n already exists**: a `t(key, fallback)` function is used throughout, plus
  `layout/language.component.tsx`. So Arabic is *add a locale + RTL*, not build i18n from zero.
- **Theme** is an inline toggle in the appearance tab (no dedicated component); only dark/light today.
- **AI key today = env-only + global**: `process.env.OPENAI_API_KEY` is read directly in ~8 places
  (`libraries/.../openai/openai.service.ts`, `agent/agent.graph.service.ts`,
  `agent/agent.graph.insert.service.ts`, `autopost/autopost.service.ts`, `videos/images-slides/images.slides.ts`,
  `apps/backend/.../copilot.controller.ts`, …). There is **no** per-org key and no UI to set one.
- **Prisma** models present: `Organization`, `User`, `UserOrganization`, `UserAssignment`. Schema is applied
  by `prisma db push --accept-data-loss` on boot ⇒ **all schema changes must be additive** (new nullable
  columns / new tables only).
- Backend layering is strict: **Controller → Service → Repository** (no shortcuts). Frontend: SWR +
  `useFetch`, native components only, Tailwind 3 tokens from `colors.scss`/`global.scss`.

## 3. Target — the seven capabilities

Reorganize the Settings tabs into a clean, grouped set (exact labels TBD in build, i18n-keyed):

1. **Account** — full name, email, change password, avatar. (New dedicated tab; reuse existing user
   update + password endpoints; add avatar upload via the existing media upload path.)
2. **Appearance** — Theme with **three** options: Light / Dark / **System** (follow OS
   `prefers-color-scheme`); Language: **Arabic + English only** (remove any other locales from the picker),
   Arabic drives full RTL.
3. **AI Keys** (admin-only) — ChatGPT key now, **Nano Banana** key placeholder for later; org-level,
   encrypted at rest, functional (actually consumed). "Test key" button that validates against the provider.
4. **Team** — keep/upgrade the existing Teams tab (members, roles, invitations). Reuse `teams.component.tsx`.
5. **Integrations / Connected Apps** — reposition the existing `approved_apps` + webhooks under one
   "Integrations" group, structured so future SaaS connectors (Google / Apple login, CRM) slot in without a
   redesign. Phase 1 = reorganize + label; actual new OAuth connectors are a later workstream.
6. **Developers / API** — keep existing `api` tab.
7. **Notifications** — surface existing email-notification prefs cleanly (already `email-notifications.component.tsx`).

## 4. Architecture per new/changed capability

### 4.1 AI Keys (highest risk — do carefully)
- **Schema (additive):** add nullable encrypted columns to `Organization`, e.g.
  `openAiKeyEnc String?`, `openAiKeyIv String?` (and `nanoBananaKeyEnc/Iv String?` reserved). Do **not**
  store plaintext. Encryption = AES-256-GCM with a server key from env (`MO_SETTINGS_ENC_KEY`); if the env
  key is absent, the feature degrades to env-fallback and the UI shows "not configured" (never crash).
- **One resolver, one boundary:** add `getOpenAiApiKey(orgId): Promise<string>` in a single service
  (e.g. `openai.service` or a small `ai-credentials.service`). It returns the decrypted **org key** if set,
  else falls back to `process.env.OPENAI_API_KEY` (preserves current behavior — publishing/AI never breaks).
  **Refactor all ~8 call sites to use this resolver** instead of reading `process.env` directly. This is the
  ponytail "no duplication" boundary and the encryption boundary in one place.
- **API:** admin-only `GET/PUT /settings/ai-keys` (Controller→Service→Repository). GET returns
  masked/last-4 + "configured" boolean, **never** the plaintext. PUT validates + encrypts + stores; a blank
  value clears. A `POST /settings/ai-keys/test` does a cheap OpenAI call (e.g. list models) and returns
  ok/fail. Authorization: only org admins/owner (reuse existing `getScope`/role guard).
- **Audit:** log key set/cleared (not the value).

### 4.2 i18n + Arabic RTL (largest — progressive)
- **Locale set** trimmed to `en`, `ar`. Add an Arabic translation dictionary for the strings the existing
  `t()` uses (start with Settings + nav shell, expand page-by-page — matches the locked "progressive" scope).
- **RTL:** when locale = `ar`, set `dir="rtl"` on `<html>` and a `.rtl` root class. Prefer CSS **logical
  properties** (margin-inline, padding-inline, inset-inline) and flip only the spots that use hard
  left/right. Phase 1 RTL scope = **Settings + the app shell (sidebar/header/nav)**; subsequent phases mirror
  Calendar, Composer, Dashboard, etc. Store the choice per user (persist + restore on load).
- **No layout regression for English:** RTL rules apply only under `[dir="rtl"]`.

### 4.3 Theme: add "System"
- Extend the current 2-state toggle to 3 (Light/Dark/System). "System" = watch
  `matchMedia('(prefers-color-scheme: dark)')` and apply the dark class reactively; explicit Light/Dark
  overrides it. Persist the choice. Locate the existing theme state owner during build and extend it (don't
  add a second theme system).

### 4.4 Account tab
- Reuse existing self-update endpoints for name/email; existing change-password flow; avatar via existing
  media upload → store on `User`. Validation + error toasts. No new auth surface.

### 4.5 Integrations reposition
- Phase 1 is **information-architecture only**: group Connected Apps + Webhooks under one "Integrations"
  header with clear affordances and a visible "more connectors coming" structure. No new OAuth providers
  built in this workstream (Google/Apple/CRM login = a later, separate workstream). This satisfies
  "reposition for future SaaS" without scope-creeping into building connectors now.

## 5. Build order (each slice = its own commit, build-verified, deployed only after owner review)

1. **Theme: System option** — smallest, self-contained, zero schema, universally useful. *(fast win)*
2. **Account tab** — name/email/password/avatar; reuses existing endpoints; no schema.
3. **Language trim + Arabic strings (Settings+shell) + RTL foundation** — additive; the i18n phase 1.
4. **AI Keys (org, encrypted, functional) + resolver refactor** — schema + API + admin UI + call-site
   migration; the highest-risk slice, done with tests on the resolver fallback.
5. **Integrations/Notifications reposition + Team polish** — IA cleanup.
6. **Progressive RTL** — mirror remaining pages over subsequent phases.

Rationale: front-load the low-risk, high-value, no-schema wins (1–2) so "ready to use" lands immediately;
isolate the risky AI-key + schema work (4) with the resolver-fallback test as the safety net; treat RTL as
an ongoing phase, not a blocker.

## 6. Testing & verification

- **AI resolver**: unit tests proving (a) org key used when set, (b) env fallback when unset, (c) never
  returns plaintext via the API, (d) missing encryption env → graceful "not configured", no crash.
- **Each slice**: `pnpm run build:frontend` (+ backend typecheck) green before deploy; owner visual review
  on `social.mappedout.co` after Coolify redeploy; **no `/ship` before owner approval + passing tests**.
- **Regression guard**: confirm AI/autopost/copilot still work with the resolver (DBU Group test account
  only for any publish path; never a client account).

## 7. Explicitly out of scope (YAGNI)

- Building new Google/Apple/CRM OAuth connectors (later workstream) — only the *placement* is done now.
- Full-app RTL in one go (progressive by design).
- Nano Banana live integration (key field reserved; wiring when the provider is ready).
- Any change to Temporal publishing, DBU integration, or the provider OAuth layer beyond the AI resolver.

## 8. Open items to confirm during build (not blockers)

- Exact tab grouping/labels and which existing tabs merge vs stay.
- Whether the encryption env key `MO_SETTINGS_ENC_KEY` is set in Coolify (owner action; until then AI keys
  degrade to env-fallback safely).
- Location of the current theme-state owner (found during slice 1).
