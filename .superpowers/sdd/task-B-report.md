# Task B (Plan Task 5) — TasksController + DI registration

Branch: `feat/tasks-reminders` (verified with `git branch --show-current` before starting; did not switch).

## Files changed

1. **Created** `apps/backend/src/api/routes/tasks.controller.ts`
   - Copied verbatim from the plan's Task 5, Step 1 code block.
   - Routes: `GET /tasks`, `GET /tasks/summary`, `POST /tasks`, `PUT /tasks/:id`, `DELETE /tasks/:id`.
   - Org scoping via `@GetOrgFromRequest()`; user via `@GetUserFromRequest()` (summary + create).
   - IDOR guard: `update`/`remove` call `this._tasks.getOne(org.id, id)` first and throw
     `ForbiddenException` if the row doesn't belong to the caller's org.
   - Dates parsed from ISO strings via the local `d()` helper before being passed to the service.

2. **Modified** `libraries/nestjs-libraries/src/database/prisma/database.module.ts`
   - Added imports:
     ```ts
     import { TasksService } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.service';
     import { TasksRepository } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.repository';
     ```
   - Added `TasksService,` and `TasksRepository,` to the `providers:` array, placed right after
     the existing `AdminStatsRepository, AdminStatsService,` pair (same position/style as every
     other service+repository pair, e.g. `NotificationService` / `NotificationsRepository`).
   - Note on "exports": this module's `exports` is a getter (`get exports() { return this.providers; }`),
     not a separately maintained literal array — so adding to `providers` automatically adds to
     `exports`, which is exactly how `NotificationService`/`NotificationsRepository` (and every
     other provider in this file) are exported. There was no separate `exports:` array to edit.

3. **Modified** `apps/backend/src/api/api.module.ts`
   - Added import: `import { TasksController } from '@gitroom/backend/api/routes/tasks.controller';`
   - Added `TasksController,` to the `authenticatedController` array, directly after
     `DbuOptionsController,` (which follows `ClientController,`). `ClientController` itself is
     registered in this same `authenticatedController` array (not a separate literal
     `controllers:` list) — the array is spread into `@Module({ controllers: [...] })` and is
     also what `AuthMiddleware` is applied to via `consumer.apply(AuthMiddleware).forRoutes(...authenticatedController)`
     in `configure()`. Registering `TasksController` here means its routes require the same
     authentication as every other org-scoped controller including `ClientController`.

## Typecheck (the critical gate)

The plan's suggested `apps/backend/tsconfig.app.json` does not exist in this repo (no Nx —
plain pnpm workspace, confirmed). Found the real backend tsconfigs via
`ls apps/backend/tsconfig*.json` → `tsconfig.json` and `tsconfig.build.json` (the latter extends
the former, adds `emitDecoratorMetadata`/`experimentalDecorators`/output settings appropriate for
compiling the Nest app, and is what the plan's own "Verification note" implicitly points at as
the backend build config). Ran:

```
npx tsc --noEmit -p apps/backend/tsconfig.build.json
```

**Output:** empty (zero errors), exit code 0.

Then verified the new/changed files were actually part of the compiled set (not silently
excluded by `rootDir`/`include`), via:

```
npx tsc --noEmit -p apps/backend/tsconfig.build.json --listFiles 2>/dev/null | \
  grep -E "tasks\.(controller|service|repository)\.ts|database\.module\.ts|api\.module\.ts"
```

Confirmed present in the file list:
- `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.repository.ts`
- `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/database.module.ts`
- `apps/backend/src/api/routes/tasks.controller.ts`
- `apps/backend/src/api/api.module.ts`

So the zero-error result genuinely covers the new controller, its imports (`TasksService`,
`CreateTaskDto`, `UpdateTaskDto`, `GetOrgFromRequest`, `GetUserFromRequest`), and both modified
DI registration files. No pre-existing baseline errors were observed to compare against — the
whole-project `--noEmit` run was completely clean both for new and pre-existing files.

## DI registration — exact lines added

`database.module.ts` imports (appended after the `AdminStats*` imports):
```ts
import { TasksService } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.service';
import { TasksRepository } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.repository';
```
`database.module.ts` providers array (appended after `AdminStatsRepository, AdminStatsService,`):
```ts
    TasksService,
    TasksRepository,
```

`api.module.ts` import (appended after the `DbuOptionsController` import):
```ts
import { TasksController } from '@gitroom/backend/api/routes/tasks.controller';
```
`api.module.ts` `authenticatedController` array (appended after `DbuOptionsController,`):
```ts
  TasksController,
```

## Commit

```
git -c user.name="Mapped Out" -c user.email="hello@mappedout.co" commit -m "feat(tasks): /tasks controller + DI registration ..."
```
Commit hash: `cd9f680b`
Files in commit: `apps/backend/src/api/api.module.ts`, `apps/backend/src/api/routes/tasks.controller.ts` (new), `libraries/nestjs-libraries/src/database/prisma/database.module.ts`.
3 files changed, 67 insertions(+), 0 deletions.

Not pushed (per instructions). Did not switch branches. Did not start the app / run the full
stack. Did not touch any file outside Task 5's declared scope (the only other untracked path in
the working tree is this `.superpowers/sdd/` report directory itself, which was not `git add`ed).

## Concerns

None blocking. Two things worth flagging for whoever reviews/integrates the whole plan:

1. **`exports:` in `database.module.ts` is a computed getter, not a literal array.** The task
   instructions said "add BOTH to the `providers:` array AND the `exports:` array," but this
   file's actual pattern (used by every existing provider, including `NotificationService`/
   `NotificationsRepository`) only ever populates `providers:` — `exports` derives from it
   automatically. I followed the file's real, consistent pattern rather than inventing a second
   literal `exports` entry that doesn't exist anywhere else in the file. This is not a deviation
   from "mirror `NotificationService`/`NotificationsRepository`" — it's the literal mirror.
2. **`ClientController` registration point.** The plan said "mirror how `ClientController` is
   registered," and `ClientController` lives in the `authenticatedController` array (which is
   spread into `controllers:` and also drives `AuthMiddleware.forRoutes(...)`), not a standalone
   `controllers:` list. `TasksController` was added to that same array, so it both appears in
   `controllers:` and is required to authenticate — consistent with the plan's requirement that
   all Task routes are org/user-scoped via `@GetOrgFromRequest()`/`@GetUserFromRequest()`, which
   need an authenticated request context.

Downstream tasks (6+, frontend) are unaffected by anything here — no frontend files were touched.
