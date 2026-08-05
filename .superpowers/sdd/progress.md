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

