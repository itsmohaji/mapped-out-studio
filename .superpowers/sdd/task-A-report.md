# Task A Report — Tasks & Reminders backend library layer (Tasks 1–4)

Branch: `feat/tasks-reminders` (confirmed via `git branch --show-current` before starting; no branch switch performed).

Plan followed: `/Users/mohamedhaji/Desktop/postiz-app/docs/superpowers/plans/2026-07-27-tasks-reminders.md`
— implemented exactly Task 1 (Prisma `Task` model), Task 2 (`TasksRepository`), Task 3 (`TasksService`),
Task 4 (create/update DTOs). Nothing outside these four tasks was touched (no controller, no DI
registration, no frontend files — those are Task 5+).

## Files created / modified

1. **Modified** `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
   - Added `model Task { ... }` immediately after `model Customer { ... }` (verbatim from the plan:
     id/orgId/title/description/type/status/priority/dueAt/remindAt/completedAt/assigneeId/
     createdById/customerId/createdAt/updatedAt/deletedAt + relations to Organization/User(x2,
     named relations `TaskAssignee`/`TaskCreatedBy`)/Customer + the two `@@index` lines).
   - Added back-relations (Prisma requires both sides of every relation):
     - `Organization` → `tasks Task[]`
     - `User` → `tasksAssigned Task[] @relation("TaskAssignee")` and
       `tasksCreated Task[] @relation("TaskCreatedBy")`
     - `Customer` → `tasks Task[]`
   - `type`/`status`/`priority` are plain `String` fields — no Prisma enum, no DB CHECK — per the
     plan's Global Constraints (this repo has repeatedly broken on enum constraints predating a new
     value). Purely additive: no existing column/model altered or removed.

2. **Created** `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.repository.ts`
   - `TasksRepository` using `PrismaRepository<'task'>`, mirroring
     `notifications/notifications.repository.ts`'s pattern exactly.
   - Methods: `list(orgId, filters)`, `getOne(orgId, id)`, `summary(orgId, userId)`,
     `create(orgId, userId, data)`, `update(orgId, id, data)`, `softDelete(orgId, id)`.
   - Every query is `orgId`-scoped and filters `deletedAt: null`; `update`/`softDelete` use
     `updateMany` scoped to `{ id, orgId, deletedAt: null }` so a cross-org id can never match
     (IDOR-safe at the repo layer; the plan's controller-layer `getOne` existence check in Task 5
     adds the 403 on top of this).
   - One deliberate, non-behavioral deviation from the plan's literal text: in `summary()`, the
     `mine` where-object's `deletedAt: null` is written as `deletedAt: null as Date | null` instead
     of a bare `null`. Reason: the bare literal produced `TS7018: Object literal's property
     'deletedAt' implicitly has an 'any' type` under this repo's `tsconfig.lib.json` — and this is
     the **exact same pattern already present as a pre-existing, unrelated error** in
     `media.repository.ts:106`. The codebase's own established idiom for this
     (`notifications.repository.ts:65`, `deletedAt: null as Date | null`) was used. Logic/runtime
     behavior is unchanged; this only satisfies the type checker.

3. **Created** `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.service.ts`
   - `TasksService` delegating to `TasksRepository`, mirroring `notifications/notification.service.ts`'s
     thin-delegate pattern.
   - `update()` sets `completedAt: new Date()` when `data.status === 'done'`, clears it
     (`completedAt: null`) when `status` is set to anything else, and leaves it untouched when
     `status` isn't part of the patch — exactly as specified.
   - Verbatim from the plan, no changes needed.

4. **Created** `libraries/nestjs-libraries/src/dtos/tasks/create.task.dto.ts` and
   `libraries/nestjs-libraries/src/dtos/tasks/update.task.dto.ts`
   - `class-validator` decorators, verbatim from the plan. `CreateTaskDto.title` required
     (`@IsString @MinLength(1) @MaxLength(300)`); everything else optional. `UpdateTaskDto` — all
     fields optional, `status` gains `@IsIn(['todo','doing','done'])` (not present on create, since
     new tasks always start `todo` server-side).

## Verification commands run + key output

1. **Prisma generate**
   ```
   npx prisma generate --schema=libraries/nestjs-libraries/src/database/prisma/schema.prisma
   ```
   Output: `✔ Generated Prisma Client (v6.5.0) to ./node_modules/@prisma/client in 652ms` — no errors.
   Confirmed the `task` delegate exists:
   `grep -rln "TaskDelegate" node_modules/.prisma/client/index.d.ts` → match found.

2. **Library typecheck** (repo has no `nx.json`/local `nx` binary — this is a plain pnpm workspace,
   not an Nx monorepo despite the plan's Nx-flavored commands, so I used the plan's stated fallback:
   `tsconfig.lib.json` exists, so per my instructions I used it directly rather than attempting `nx run`):
   ```
   npx tsc --noEmit -p libraries/nestjs-libraries/tsconfig.lib.json
   ```
   Ran this after each of Tasks 2/3/4 and filtered for the specific new file each time
   (`grep -i "tasks.repository"` / `"tasks.service"` / `"dtos/tasks"`) — zero matches every time.
   Final full run produces exactly **9 errors, all pre-existing, all in files I never touched**
   (`agent.graph.insert.service.ts`, `agent.graph.service.ts`, `autopost.service.ts`,
   `media.repository.ts`, `empty.provider.ts` x2, `mastodon.custom.provider.ts` x2,
   `track.service.ts`). Diffed this against the pre-change baseline error set (captured before my
   `deletedAt as Date | null` fix, from the first typecheck run) — **byte-identical**, confirming my
   four new files introduce zero new type errors of any kind, and none of my files appear in the
   error list.

## Commits (in order)

| Hash | Message |
|---|---|
| `4879dff9` | `feat(tasks): add Task prisma model + back-relations (additive)` |
| `38bc752c` | `feat(tasks): TasksRepository (org-scoped CRUD)` |
| `d2643a8b` | `feat(tasks): TasksService (completedAt on done)` |
| `7711d191` | `feat(tasks): create/update DTOs` |

All commits made with `git -c user.name="Mapped Out" -c user.email="hello@mappedout.co"` as required.
Nothing was pushed. `git status --short` after the last commit shows a clean tree for tracked files
(only a pre-existing untracked `.superpowers/sdd/progress.md` remains, which predates this session
and was not created or touched by this work).

## Concerns

- **Minor, disclosed, low-risk deviation from "verbatim":** the one-line `null` → `null as Date | null`
  type-cast in `tasks.repository.ts`'s `summary()` method, made to satisfy `tsc --noEmit`. This changes
  zero runtime behavior and follows an idiom already established elsewhere in this exact file family
  (`notifications.repository.ts`). Flagging it explicitly since the brief asked for verbatim code.
- **Plan's Nx commands don't apply to this repo.** This is a pnpm workspace (`package.json` scripts
  use `pnpm --filter`), not an Nx monorepo — there's no `nx.json` and no local `nx` binary, so
  `npx nx run nestjs-libraries:build` isn't runnable as written in the plan. I used the tsconfig-based
  fallback per my own task instructions, which the plan also lists as an acceptable alternative.
  Later tasks (5+, out of my scope) that reference `nx run backend:build` / `frontend:build` will hit
  the same issue and should use the pnpm-equivalent `build:backend` / `build:frontend` scripts instead.
- Task 5 (controller + DI registration) and beyond are explicitly out of scope for this run and were
  not started — `TasksController`, `database.module.ts`, and `api.module.ts` are untouched.
