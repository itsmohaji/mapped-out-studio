# Reference Repository Assessment (Phase 0)

> **Status:** Phase 0 deliverable. Licenses/languages verified live via the GitHub API on 2026-07-25;
> **install status refreshed 2026-07-27** — gstack + ponytail are now installed as Claude Code skills
> (see §4/§5); BrightBean + Refine cloned **outside** the repo at `~/reference-repos/` (read-only, never
> a dependency, never inside the commercial codebase).
> **Rule:** these are references only. Do NOT rebuild Mapped Out on any of them, do NOT copy source, do NOT replace the existing architecture. Ideas/patterns are reusable; source code and copyleft-licensed implementations are not.

## Verified facts

| Repo | License (SPDX) | Primary language | Use |
|---|---|---|---|
| `gitroomhq/postiz-app` | **AGPL-3.0** | TypeScript | The foundation (the fork's own base) |
| `brightbeanxyz/brightbean-studio` | **AGPL-3.0** | **Python** | Product/architecture concepts only |
| `refinedev/refine` | **MIT** | TypeScript | Enterprise React patterns |
| `garrytan/gstack` | MIT | TypeScript | Engineering-workflow reference |
| `DietrichGebert/ponytail` | MIT | JavaScript | Minimal-dependency discipline |
| **Mapped Out fork** (`itsmohaji/postiz-app`) | **AGPL-3.0** (declared in `package.json`) | TypeScript | The product |

## ⚠️ Licensing reality (flag for you / counsel)

**Mapped Out is already an AGPL-3.0 work** — it is a fork/derivative of AGPL Postiz and declares `AGPL-3.0` itself. AGPL's network-copyleft obligations therefore already apply to the whole application (e.g. offering corresponding source to users who interact with it over the network). Your instruction "do not import AGPL code into the commercial Mapped Out codebase" cannot make the existing base non-AGPL; it can only mean "don't add *further* copyleft code from *other* projects." This is a genuine legal matter (there is a `~/Desktop/mappedout-legal` folder) — **flagging, not resolving.** No action taken.

## Per-repository assessment

### 1. Postiz — the foundation (preserve)
- **Reuse (keep, don't rebuild):** OAuth/provider layer, Temporal publishing/scheduling/retry, token-refresh workflows, media handling, auth middleware, org tenancy, the fork-added RBAC (`RolesGuard`/`UserAssignment`) and DBU integration scaffolding.
- **Incompatible/avoid:** nothing — it *is* the base.
- **Security:** the audit's findings (IG silent-fail, per-client IDOR, DBU outbound durability, no tests, JWT expiry) all live here and are the upgrade backlog.
- **Recommendation:** extend and harden in place. Never replace working Postiz infrastructure merely because another repo has a similar feature.

### 2. BrightBean Studio — concepts only (do NOT touch code)
- **Useful ideas:** workspaces, team access, content composer with platform-specific versions, content queues, approvals, nested media folders, analytics, publishing-retry patterns, audit history, account health, social-inbox concept, notification structure, background workers.
- **Incompatible technology:** **Python** (Django-family) — a completely different stack from the NestJS/Next/Temporal fork. Do NOT introduce Python/Django; do NOT install it as a dependency.
- **Licence restriction:** **AGPL-3.0** — copyleft. Do NOT copy source. Concepts/UX patterns are fine (ideas aren't copyrightable); code is not.
- **Existing Mapped Out equivalents:** composer (`new-launch/*`), media (`media.component.tsx`), approvals (`PostApproval`/`client.controller`), account health (partial — `Integration.refreshNeeded`/`disabled`, to be surfaced).
- **Final recommendation:** study for product/UX ideas (esp. account-health surfacing, content queues, nested media folders, social inbox); implement natively in TypeScript. Zero code import.

### 3. Refine — enterprise React patterns (selective, MIT)
- **Useful ideas:** centralized resource management, access-control shape, data-provider pattern, React-Query usage, realtime updates, audit logs, versioning, enterprise CRUD design.
- **Compatible?** Partially. The fork already uses **SWR + Zustand + Next App Router + NestJS**; Refine assumes its own data-provider/router conventions.
- **Licence:** MIT — safe to depend on *if* justified.
- **Existing equivalents:** SWR (fetching), Zustand (`new-launch/store.ts`), NestJS controllers (CRUD), `getScope` (access control).
- **Final recommendation:** reference the *patterns* (a single resource/authorization abstraction, audit/versioning conventions) but do **not** adopt Refine as a framework — it would fight the existing router/auth and add a second access-control layer (explicitly disallowed). Use a specific Refine package only on a proven gap + compatibility + test-backed no-regression.

### 4. gstack — engineering workflow (MIT) — **NOW INSTALLED**
- **Status in this environment (2026-07-27):** installed at `~/.claude/skills/gstack` via `./setup --host claude`
  (requires `bun`, which was installed from the official bun.sh installer). ~50 skills registered, including
  the commands you named: `office-hours`, `spec`, `autoplan`, `plan-ceo-review`, `plan-eng-review`,
  `plan-design-review`, `plan-devex-review`, `investigate`, `review`, `qa`, `qa-only`, `cso`, `ship`,
  `land-and-deploy`, plus `careful`, `guard`, `retro`, `design-review`, `context-save/restore`, `browse`.
- **Primary workflow (your directive):** gstack is the primary engineering loop —
  plan (`/autoplan` / `/spec` / `/office-hours`) → reviews (`/plan-eng-review`, `/plan-design-review`,
  `/plan-ceo-review`) → build → `/review` + `/qa` + `/cso` (security) → `/ship`. It composes with the
  Superpowers discipline skills (TDD, verification-before-completion) rather than replacing them.
- **Licence:** MIT — safe to install and use as tooling. It is *tooling*, not a runtime dependency of the app;
  nothing from gstack ships inside the Mapped Out bundle.
- **Security consideration:** `setup` builds a Playwright headless-Chromium `browse` binary and can register
  a pre-push credential-redaction git hook (`gstack-config set redact_prepush_hook true`) — recommended.
- **Ship gate (hard rule):** **never run `/ship` (or any production deploy) before the owner visually approves
  the phase AND all tests pass.** This overrides gstack's own defaults.

### 5. ponytail — minimal-dependency discipline (MIT) — **NOW INSTALLED**
- **Status (2026-07-27):** installed at `~/.claude/skills/ponytail` (cloned; it ships as a Claude skill/plugin).
  Applied as a supporting discipline, not a code generator.
- **Discipline:** prevent unnecessary dependencies, duplicated components/logic, excessive abstractions,
  rewriting working features, and dead code.
- **Guardrail (your rule — non-negotiable):** ponytail must **never** remove or weaken validation,
  authentication, authorization, security, error handling, accessibility, audit logging, tests, migrations,
  DBU compatibility, or publishing reliability. "Minimal" means no *gratuitous* additions — never fewer safeguards.
- **Licence:** MIT — safe as tooling; nothing ships in the app bundle.
- **Recommendation:** run ponytail's checks before proposing new libraries or abstractions; prefer extending
  existing modules. Every new dependency needs justification + compatibility + bundle/maintenance + tests.

## Net recommendation
Postiz stays the engine. Refine/BrightBean/gstack/ponytail inform *patterns and discipline only*. No stack change, no second authz layer, no Python, no copyleft code import, no framework swap. Every "reuse" is a concept re-implemented natively in the existing TypeScript stack with tests.
