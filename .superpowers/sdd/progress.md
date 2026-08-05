# Tasks & Reminders — SDD progress
Branch: feat/tasks-reminders
Plan: docs/superpowers/plans/2026-07-27-tasks-reminders.md

- Task 1 (Prisma Task model): complete (7711d191, additive schema verified, tsc clean)
- Task 2 (TasksRepository): complete (7711d191, additive schema verified, tsc clean)
- Task 3 (TasksService): complete (7711d191, additive schema verified, tsc clean)
- Task 4 (DTOs): complete (7711d191, additive schema verified, tsc clean)
- Task 5 (Controller + DI): complete (cd9f680b, tsc clean, DI verified: providers+exports getter)
- Task 6 (FE api + form): complete (0a3c0372, esbuild clean)
- Task 7 (Tasks page + nav badge): complete (6ff6c896, esbuild clean; MenuItem gained an
  optional `badge` prop, not in the plan's file list but additive/single-call-site — see
  task-C-report.md Deviations)
- Task 8 (wire buttons + dashboard card): complete (eb170d3e, esbuild + full-project
  `tsc --noEmit` clean, 0 errors)
- Task 9 (deploy + verify): COMPLETE — merged to mappedout-branding (c12c8356), built, redeployed; backend booted (/api/tasks=401 unauth), Task table created. LIVE.


Final review: 2 CRITICAL found (partial-update date wipe; orgId mass-assignment) — both FIXED + verified (commit c12c8356). Deferred (non-blocking): validate assigneeId/customerId org-membership (Important); Query DTO for list (Minor).

---

# AI Assistant Phase A — SDD progress
Branch: mappedout-branding
Plan: docs/superpowers/plans/2026-08-05-ai-assistant-phase-a.md
Started from: 6100501e (plan) / pre-flight fixes committed

Pre-flight: fixed 2 self-authored plan defects (dead `drop` helper in Task 8;
'you' role comparison in Task 10). No design conflicts requiring owner input.

- Task 1 (schema: AiThread/AiMessage/AiFolder): complete (e2f0790b..2bcf9e16, review clean, additive-only verified, prisma delegates confirmed present)
- Task 2 (capability surface field): complete (2bcf9e16..25011811, review clean after 1 fix pass — prettier + tautological test replaced)
- Task 3 (pure thread helpers): complete (25011811..f87a6c52, review clean; 23 suites / 405 tests)
  MINOR carried to final review: the brief's truncation test puts the space at index 20 exactly,
  so `lastSpace > 20` is false and the word-boundary branch of threadTitleFrom is never exercised.
- Task 4 (threads repository): complete (f87a6c52..1d6acf37, review clean, no findings)
- Task 5 (threads service + DI): complete (1d6acf37..68edc00c, review clean; 24 suites / 409 tests
  verified by controller at final commit)
  Journey: impl 7a053676 -> fix 23326a60 (unique constraint) -> REVERTED 68edc00c.
  The constraint bound soft-deleted rows too, so deleting a folder permanently reserved its name and
  deleting all 3 defaults left library() reseeding into P2002 forever, returning an empty list with
  no error. Reachable by ordinary clicking; the race it fixed needs two concurrent first-ever loads
  and yields a deletable duplicate. Race accepted + documented in code. Correct fix would be a
  partial index over `deletedAt IS NULL`, which prisma db push cannot express.
  Implementer also corrected 2 brief defects: redundant threadById round-trip in thread(); doc
  comment containing the literal string its own test banned.
- Task 6 (threads controller + api.module): complete (68edc00c..41833d95, review clean, 2 Minors below)
  Verified by controller: all 10 controller call sites match service signatures; service caps
  title (120) and name (60), so the reviewer's "unbounded fields" Minor is covered except `sections`.
  Route shadowing is safe by SEGMENT COUNT (/:id/delete is 2 segments, /folder/:id/delete is 3),
  not by declaration order as the implementer reasoned. GET /library IS correctly declared before
  GET /:id, where order does matter.

MINORS CARRIED TO FINAL REVIEW:
  1. threadTitleFrom's word-boundary branch is never exercised (Task 3 brief's test puts the space
     at index 20 exactly, and the guard is `> 20`).
  2. `sections` (Json) is passed from controller to DB untyped and unbounded.
  3. api.module.ts gained an unrequested prettier reflow of an unrelated OAuth import.

ENV NOTE: backend `tsc -p tsconfig.json` now reports 9 noImplicitAny errors, up from 6 at session
start. The 3 new ones (agent.graph.insert.service, agent.graph.service, autopost.service — all
TS7011) are in untouched files and appeared after `pnpm install` regenerated the Prisma client.
0 errors in any ai-threads file. `nest build` (tsconfig.build.json) passes — that is the real gate.

BACKEND COMPLETE (Tasks 1-6). Frontend is Tasks 7-12.
- Task 7 (SWR hooks + mutators): complete (41833d95..2a9f879e, review clean, all 10 routes verified against controller)
- Task 8 (folder sidebar, native drag-drop, RTL-safe): complete (2a9f879e..0d538c32, review clean, no new deps)
- Task 9 (starter cards): complete (e926ed39..08c5fd5f, review clean; one filled card verified against registry)
- Task 10 (thread view + credit ring): complete (08c5fd5f..049c4f8f, review clean)
  Reviewer surfaced a PLAN DEFECT (not a Task 10 fault): /ai-assist/ask returns {ok,text,page,credits}
  and never `sections`. /ai-orchestra/run is the only endpoint returning sections and its only caller
  is capability.grid.tsx, which Task 11 deletes. As planned, Task 11 would make all 8 capabilities
  unreachable and leave AiAnswer dead. Plan amended before dispatching Task 11 — see below.
- Task 11 (page assembly): complete (3bd926bc..6b563b82, review clean after 1 fix pass)
  Fixed 2 plan-level regressions the review caught:
  (a) 5 of 8 capabilities became unreachable when CapabilityGrid was deleted — StarterCards only
      exposes 3. Added a "More capabilities" row derived from assistantCapabilities() filtered
      against STARTER_CARDS (this is what Task 2's assistantCapabilities() was FOR — it had no
      consumer until now). write_captions correctly stays out; it is composer-only.
  (b) customerId/timeframeDays were dead after the settings bar was removed, so every capability
      run was unscoped and pinned to 30 days. Restored a compact scope row.
- Task 12 (spotlight persists to threads): complete (6b563b82..2938abd2, review clean)
ALL 12 TASKS COMPLETE. Final whole-branch review next.

## FINAL STATE — 2026-08-05, safe stopping point

ALL 12 TASKS COMPLETE + final whole-branch review + fix pass, all reviewed.
HEAD = d695dd76. NOTHING PUSHED. Last pushed commit is cfb7e45e (this morning's Phase 2).

Verified independently at HEAD: 24 suites / 411 tests pass; build:frontend exit 0; build:backend exit 0.

Final review verdict: all 8 findings closed, branch SAFE TO DEPLOY.
Mutation-tested by the verifier: adding @ClientAllowed() to the controller turns the boundary
spec red (so that security test is real now, it used to be vacuous).

### TO RESUME
1. Owner has NOT visually approved yet — hard gate (ADR-025). Do not ship.
2. To deploy: push mappedout-branding -> CI builds :mappedout -> redeploy in Coolify ->
   verify https://social.mappedout.co (health check /api/ WITH trailing slash).

### THREE SMALL FOLLOW-UPS the verifier recommends (not blocking)
a. thread.view.tsx: onCapabilityConsumed?.() fires even when `failed` is true, so a transient
   provider error silently downgrades the user's retry to free-text. Guard with `if (!failed)`.
b. thread.view.tsx render: `{m.sections ? <AiAnswer/> : text}` — a legacy row with a truthy
   non-array `sections` renders an empty bubble and hides the stored text. Use
   `Array.isArray(m.sections) && m.sections.length` at the call site.
c. thread.view.tsx: startThread does `(await fetch()).json()`; a non-JSON error body (an HTML 502
   from the Coolify proxy) throws SyntaxError past the guard, losing the draft with no toast.
   Wrap the body parse in a catch.
d. Consider injecting AiContextRepository instead of AiContextService into AiThreadsService.
   resolveCustomer needs nothing from IntegrationService, and that injection is the ONLY reason
   importing the service drags in every social provider + bcrypt (48s, fails). With the repository
   it imports in 0.7s, which would let the F5 customerId check have a real behavioural test
   instead of the source-substring tripwires it has now.

### FOUR DEFERRED SCOPE ITEMS — owner should decide before showing anyone
1. Sidebar shows only 8 threads per group, no scroll/search. Every Cmd-K question files a thread,
   so spotlight queries will bury real conversations.
2. Threads and folders cannot be deleted from the UI. Routes and mutators exist; nothing calls them.
3. Capability answers no longer show provenance. /ai-orchestra/run still returns `coverage`
   ("Based on 2/5 channels reporting · 41 posts · 30 days") and ThreadView discards it.
   This is a step back from the design's D6 honesty posture.
4. NO CONVERSATIONAL MEMORY. Each message is sent alone; prior turns never reach the model.
   Looks like a chat, behaves like one-shot queries. Not promised in the design, but the gap
   most likely to read as "broken".

### PHASE B (not started, needs its own spec)
Proactive recommendations need stored per-post metrics. postAnalytics() fetches live per provider
and caches to Redis; there is NO Postgres history to compute "38% below average" against.
