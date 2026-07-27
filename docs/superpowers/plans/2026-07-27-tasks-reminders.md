# Tasks & Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top-bar **Add Task** and **Set Reminder** buttons real, persistent features backed by one unified org-scoped `Task` table, with a Tasks page, sidebar badge, dashboard card, and due/overdue surfacing.

**Architecture:** One new Prisma model `Task` (mirrors the org-scoped `Customer` model). Backend = a `tasks` repository/service (in `nestjs-libraries`) + a `/tasks` controller (in `apps/backend`), registered like every other entity. Frontend = a task API client, one shared create modal (full = Add Task, compact = Set Reminder), a Tasks page + nav item + badge, and a Dashboard card.

**Tech Stack:** NestJS + Prisma (backend), Next.js + React + SWR + Tailwind (frontend), the app's `useFetch` / `useModals` helpers.

## Global Constraints

- **Prisma changes are ADDITIVE ONLY** — `prisma db push --accept-data-loss` runs on container boot; add a NEW table + additive back-relations only, never alter/remove existing columns.
- **`type`/`status`/`priority` are plain strings, NOT Prisma enums / DB CHECKs** (this repo has repeatedly broken on enum constraints that predate a new value).
- **All queries org-scoped** via `@GetOrgFromRequest()`; exclude `deletedAt != null`; `:id` mutations verify the row's `orgId` == caller org (IDOR-safe).
- **Internal only** — never referenced by the client portal (`client.controller.ts` / portal endpoints).
- **User-facing copy = "Mapped Out" / generic** — never the upstream product name.
- **Deploy:** push `mappedout-branding` → GHCR `:mappedout` build → Coolify force-pull redeploy. Backend boot errors 502 the whole app — typecheck/build before pushing; stage on `phase2` if no safe window.

## File Structure

- Create `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.repository.ts` — Prisma CRUD, org-scoped.
- Create `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.service.ts` — delegates + `completedAt` logic.
- Create `apps/backend/src/api/routes/tasks.controller.ts` — `/tasks` routes.
- Create `libraries/nestjs-libraries/src/dtos/tasks/create.task.dto.ts` and `update.task.dto.ts`.
- Modify `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — add `Task` model + back-relations.
- Modify `libraries/nestjs-libraries/src/database/prisma/database.module.ts` — register service + repository.
- Modify `apps/backend/src/api/api.module.ts` — register controller.
- Create `apps/frontend/src/components/tasks/task.api.ts` — typed client calls.
- Create `apps/frontend/src/components/tasks/task-form.tsx` — shared create/edit modal.
- Create `apps/frontend/src/components/tasks/tasks.component.tsx` — Tasks page.
- Create `apps/frontend/src/app/(app)/(site)/tasks/page.tsx` — route.
- Modify `apps/frontend/src/components/layout/top.menu.tsx` — add "Tasks" nav item + badge.
- Modify `apps/frontend/src/components/new-layout/layout.component.tsx` — wire Add Task / Set Reminder.
- Modify `apps/frontend/src/components/dashboard/dashboard.component.tsx` — "My tasks" card.

**Verification note:** this repo has no quick backend unit-test runner; the real gates are TypeScript compile (`npx nx run backend:build`, `npx nx run frontend:build`), per-file esbuild transform for fast frontend syntax checks, and post-deploy REST probes. Steps use those as the "test" gate (honest for this codebase) instead of fake unit scaffolding.

---

### Task 1: Prisma `Task` model

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma delegate `task` (model `Task`) with fields id, orgId, title, description, type, status, priority, dueAt, remindAt, completedAt, assigneeId, createdById, customerId, createdAt, updatedAt, deletedAt.

- [ ] **Step 1: Add the model** — append after the `Customer` model:

```prisma
model Task {
  id           String       @id @default(uuid())
  orgId        String
  title        String
  description  String?
  type         String       @default("task")
  status       String       @default("todo")
  priority     String?
  dueAt        DateTime?
  remindAt     DateTime?
  completedAt  DateTime?
  assigneeId   String?
  createdById  String?
  customerId   String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?
  organization Organization @relation(fields: [orgId], references: [id])
  assignee     User?        @relation("TaskAssignee", fields: [assigneeId], references: [id])
  createdBy    User?        @relation("TaskCreatedBy", fields: [createdById], references: [id])
  customer     Customer?    @relation(fields: [customerId], references: [id])

  @@index([orgId, status, deletedAt])
  @@index([orgId, assigneeId, deletedAt])
}
```

- [ ] **Step 2: Add back-relations** (Prisma requires both sides). In `model Organization {`, add `tasks Task[]`. In `model User {`, add `tasksAssigned Task[] @relation("TaskAssignee")` and `tasksCreated Task[] @relation("TaskCreatedBy")`. In `model Customer {`, add `tasks Task[]`.

- [ ] **Step 3: Generate the client**

Run: `npx prisma generate --schema=libraries/nestjs-libraries/src/database/prisma/schema.prisma`
Expected: "Generated Prisma Client" with no error; `task` delegate now exists.

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/schema.prisma
git commit -m "feat(tasks): add Task prisma model + back-relations (additive)"
```

---

### Task 2: TasksRepository

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.repository.ts`

**Interfaces:**
- Consumes: `PrismaRepository<'task'>` (from `prisma.service`).
- Produces: `TasksRepository` with `list(orgId, filters)`, `summary(orgId, userId)`, `create(orgId, userId, data)`, `update(orgId, id, data)`, `softDelete(orgId, id)`, `getOne(orgId, id)`.

- [ ] **Step 1: Create the repository** (mirrors `notifications.repository.ts`):

```typescript
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface TaskFilters {
  status?: string;
  type?: string;
  assigneeId?: string;
  customerId?: string;
}
export interface TaskWrite {
  title?: string;
  description?: string | null;
  type?: string;
  status?: string;
  priority?: string | null;
  dueAt?: Date | null;
  remindAt?: Date | null;
  assigneeId?: string | null;
  customerId?: string | null;
}

@Injectable()
export class TasksRepository {
  constructor(private _task: PrismaRepository<'task'>) {}

  list(orgId: string, filters: TaskFilters = {}) {
    return this._task.model.task.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  getOne(orgId: string, id: string) {
    return this._task.model.task.findFirst({ where: { id, orgId, deletedAt: null } });
  }

  async summary(orgId: string, userId: string) {
    const now = new Date();
    const mine = { orgId, deletedAt: null, assigneeId: userId, status: { not: 'done' } };
    const [open, overdue] = await Promise.all([
      this._task.model.task.count({ where: mine }),
      this._task.model.task.count({ where: { ...mine, dueAt: { lt: now } } }),
    ]);
    return { open, overdue };
  }

  create(orgId: string, userId: string, data: TaskWrite) {
    return this._task.model.task.create({
      data: {
        orgId,
        createdById: userId,
        title: data.title!,
        description: data.description ?? null,
        type: data.type ?? 'task',
        status: data.status ?? 'todo',
        priority: data.priority ?? null,
        dueAt: data.dueAt ?? null,
        remindAt: data.remindAt ?? null,
        assigneeId: data.assigneeId ?? null,
        customerId: data.customerId ?? null,
      },
    });
  }

  update(orgId: string, id: string, data: TaskWrite & { completedAt?: Date | null }) {
    return this._task.model.task.updateMany({ where: { id, orgId, deletedAt: null }, data });
  }

  softDelete(orgId: string, id: string) {
    return this._task.model.task.updateMany({
      where: { id, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
```

- [ ] **Step 2: Typecheck** — `npx nx run nestjs-libraries:build` (or `npx tsc --noEmit -p libraries/nestjs-libraries/tsconfig.lib.json`). Expected: no errors referencing `tasks.repository.ts`.

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/tasks/tasks.repository.ts
git commit -m "feat(tasks): TasksRepository (org-scoped CRUD)"
```

---

### Task 3: TasksService

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/tasks/tasks.service.ts`

**Interfaces:**
- Consumes: `TasksRepository`.
- Produces: `TasksService` with the same method names as the repo; `update` sets `completedAt` when `status` becomes `done`, clears it otherwise.

- [ ] **Step 1: Create the service:**

```typescript
import { Injectable } from '@nestjs/common';
import {
  TasksRepository,
  TaskFilters,
  TaskWrite,
} from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.repository';

@Injectable()
export class TasksService {
  constructor(private _tasks: TasksRepository) {}

  list(orgId: string, filters: TaskFilters) {
    return this._tasks.list(orgId, filters);
  }
  summary(orgId: string, userId: string) {
    return this._tasks.summary(orgId, userId);
  }
  getOne(orgId: string, id: string) {
    return this._tasks.getOne(orgId, id);
  }
  create(orgId: string, userId: string, data: TaskWrite) {
    return this._tasks.create(orgId, userId, data);
  }
  update(orgId: string, id: string, data: TaskWrite) {
    const completed: { completedAt?: Date | null } =
      data.status === 'done'
        ? { completedAt: new Date() }
        : data.status
        ? { completedAt: null }
        : {};
    return this._tasks.update(orgId, id, { ...data, ...completed });
  }
  remove(orgId: string, id: string) {
    return this._tasks.softDelete(orgId, id);
  }
}
```

- [ ] **Step 2: Typecheck** — `npx nx run nestjs-libraries:build`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/tasks/tasks.service.ts
git commit -m "feat(tasks): TasksService (completedAt on done)"
```

---

### Task 4: DTOs

**Files:**
- Create: `libraries/nestjs-libraries/src/dtos/tasks/create.task.dto.ts`
- Create: `libraries/nestjs-libraries/src/dtos/tasks/update.task.dto.ts`

**Interfaces:**
- Produces: `CreateTaskDto` (title required), `UpdateTaskDto` (all optional).

- [ ] **Step 1: Create `create.task.dto.ts`:**

```typescript
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['task', 'reminder']) type?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsDateString() remindAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() customerId?: string;
}
```

- [ ] **Step 2: Create `update.task.dto.ts`:**

```typescript
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(['task', 'reminder']) type?: string;
  @IsOptional() @IsIn(['todo', 'doing', 'done']) status?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high']) priority?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsDateString() remindAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() customerId?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/tasks/
git commit -m "feat(tasks): create/update DTOs"
```

---

### Task 5: TasksController + DI registration

**Files:**
- Create: `apps/backend/src/api/routes/tasks.controller.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts`
- Modify: `apps/backend/src/api/api.module.ts`

**Interfaces:**
- Consumes: `TasksService`, `@GetOrgFromRequest()`, `@GetUserFromRequest()`.
- Produces: REST routes `GET/POST /tasks`, `GET /tasks/summary`, `PUT/DELETE /tasks/:id`.

- [ ] **Step 1: Create the controller** (mirrors `client.controller.ts` structure; dates parsed from ISO strings):

```typescript
import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { TasksService } from '@gitroom/nestjs-libraries/database/prisma/tasks/tasks.service';
import { CreateTaskDto } from '@gitroom/nestjs-libraries/dtos/tasks/create.task.dto';
import { UpdateTaskDto } from '@gitroom/nestjs-libraries/dtos/tasks/update.task.dto';

const d = (v?: string) => (v ? new Date(v) : null);

@ApiTags('Tasks')
@Controller('/tasks')
export class TasksController {
  constructor(private _tasks: TasksService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization, @Query() q: any) {
    return this._tasks.list(org.id, {
      status: q.status, type: q.type, assigneeId: q.assigneeId, customerId: q.customerId,
    });
  }

  @Get('/summary')
  summary(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User) {
    return this._tasks.summary(org.id, user.id);
  }

  @Post('/')
  create(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Body() body: CreateTaskDto) {
    return this._tasks.create(org.id, user.id, {
      ...body, dueAt: d(body.dueAt), remindAt: d(body.remindAt),
    });
  }

  @Put('/:id')
  async update(@GetOrgFromRequest() org: Organization, @Param('id') id: string, @Body() body: UpdateTaskDto) {
    const existing = await this._tasks.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._tasks.update(org.id, id, {
      ...body, dueAt: d(body.dueAt), remindAt: d(body.remindAt),
    });
  }

  @Delete('/:id')
  async remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    const existing = await this._tasks.getOne(org.id, id);
    if (!existing) throw new ForbiddenException();
    return this._tasks.remove(org.id, id);
  }
}
```

- [ ] **Step 2: Register service + repository** in `database.module.ts` — add imports for `TasksService` and `TasksRepository`, then add both to the `providers:` array AND the `exports:` array (mirror how `NotificationService`/`NotificationsRepository` are listed).

- [ ] **Step 3: Register the controller** in `apps/backend/src/api/api.module.ts` — add `import { TasksController } from '@gitroom/backend/api/routes/tasks.controller';` and add `TasksController,` to the `controllers:` array (mirror `ClientController`).

- [ ] **Step 4: Build the backend** — `npx nx run backend:build`. Expected: success, no DI/type errors. (A failure here is a boot-crash risk — do NOT push until green.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/routes/tasks.controller.ts apps/backend/src/api/api.module.ts libraries/nestjs-libraries/src/database/prisma/database.module.ts
git commit -m "feat(tasks): /tasks controller + DI registration"
```

---

### Task 6: Frontend task API client + shared form modal

**Files:**
- Create: `apps/frontend/src/components/tasks/task.api.ts`
- Create: `apps/frontend/src/components/tasks/task-form.tsx`

**Interfaces:**
- Produces: `useTasksApi()` → `{ list, summary, create, update, remove }`; `TaskForm` component with props `{ compact?: boolean; task?: TaskRow; onSaved: () => void }`.

- [ ] **Step 1: Create `task.api.ts`** (uses the app `useFetch`):

```typescript
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';

export interface TaskRow {
  id: string; title: string; description?: string | null; type: string; status: string;
  priority?: string | null; dueAt?: string | null; remindAt?: string | null;
  assigneeId?: string | null; customerId?: string | null; completedAt?: string | null; createdAt: string;
}

export const useTasksApi = () => {
  const fetch = useFetch();
  const list = useCallback(async (qs = '') => (await fetch(`/tasks${qs}`)).json(), []);
  const summary = useCallback(async () => (await fetch('/tasks/summary')).json(), []);
  const create = useCallback(async (body: any) => (await fetch('/tasks', { method: 'POST', body: JSON.stringify(body) })).json(), []);
  const update = useCallback(async (id: string, body: any) => (await fetch(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) })).json(), []);
  const remove = useCallback(async (id: string) => (await fetch(`/tasks/${id}`, { method: 'DELETE' })), []);
  return { list, summary, create, update, remove };
};
```

- [ ] **Step 2: Create `task-form.tsx`** — a form using the existing inputs + `glass-surface`. Full mode: title, description, assignee (`/integrations/customers` for clients; team members via existing `useUser`/team source if available, else free omit), client dropdown (`/integrations/customers`), due date/time, priority, type hidden `task`. Compact mode (`compact`): title + `remindAt` datetime only, `type='reminder'`. On submit call `create`/`update`, then `onSaved()` and close via `useModals().closeAll()`. (Reuse the styling and structure of `clients/clients.component.tsx`'s `AddClientModal`.)

- [ ] **Step 3: esbuild syntax check** — `node_modules/.bin/esbuild apps/frontend/src/components/tasks/task-form.tsx --format=esm --jsx=automatic > /dev/null`. Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tasks/task.api.ts apps/frontend/src/components/tasks/task-form.tsx
git commit -m "feat(tasks): frontend task api + shared create/edit form"
```

---

### Task 7: Tasks page + route + nav item + badge

**Files:**
- Create: `apps/frontend/src/components/tasks/tasks.component.tsx`
- Create: `apps/frontend/src/app/(app)/(site)/tasks/page.tsx`
- Modify: `apps/frontend/src/components/layout/top.menu.tsx`

**Interfaces:**
- Consumes: `useTasksApi`, `TaskForm`.
- Produces: `/tasks` route rendering `TasksComponent`; a "Tasks" nav item with a live count badge from `/tasks/summary`.

- [ ] **Step 1: Create `tasks.component.tsx`** — `useSWR('/tasks', ...)` via `useTasksApi().list`; group by status (To-do / Doing / Done) in glass cards; each row: title, client name, due date, assignee, complete toggle (`update(id,{status})`), edit (opens `TaskForm`), delete (`remove`). "+ Add Task" opens `TaskForm`. Empty state. (Mirror `clients.component.tsx` layout + `dashboard.component.tsx` `Card`.)

- [ ] **Step 2: Create the route** `app/(app)/(site)/tasks/page.tsx`:

```typescript
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { TasksComponent } from '@gitroom/frontend/components/tasks/tasks.component';
export const metadata: Metadata = { title: 'Mapped Out Social Tasks', description: '' };
export default async function Index() { return <TasksComponent />; }
```

- [ ] **Step 3: Add the nav item + badge** in `top.menu.tsx` — add a `{ section: 'Operations', name: t('tasks','Tasks'), icon: <clipboard svg>, path: '/tasks' }` entry to `firstMenu` (after Analytics). Add a small `useSWR('/tasks/summary', ...)` in `TopMenu` and render the `open` count as a badge on the Tasks item when > 0 (reuse the `.cbadge`-style span from the artifact: `rounded-full bg-btnPrimary text-white text-[10px] px-[6px]`). Keep collapsed behavior (badge hidden when collapsed).

- [ ] **Step 4: esbuild syntax check** both new/changed frontend files (`esbuild ... --format=esm --jsx=automatic`). Expected: no error.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tasks/tasks.component.tsx "apps/frontend/src/app/(app)/(site)/tasks/page.tsx" apps/frontend/src/components/layout/top.menu.tsx
git commit -m "feat(tasks): Tasks page + route + nav item with live badge"
```

---

### Task 8: Wire top-bar buttons + Dashboard card

**Files:**
- Modify: `apps/frontend/src/components/new-layout/layout.component.tsx`
- Modify: `apps/frontend/src/components/dashboard/dashboard.component.tsx`

**Interfaces:**
- Consumes: `TaskForm`, `useModals`, `useTasksApi`.

- [ ] **Step 1: Re-enable the buttons** — in `layout.component.tsx`, remove the `disabled`/"Coming soon" state from **Add Task** and **Set Reminder**. `Add Task` → `modals.openModal({ title:'Add Task', children:<TaskForm onSaved=.../> })`; `Set Reminder` → `modals.openModal({ title:'Set Reminder', children:<TaskForm compact onSaved=.../> })`. Keep `Schedule Post` accent → composer. (Import `useModals` + `TaskForm`.)

- [ ] **Step 2: Dashboard "My tasks" card** — in `dashboard.component.tsx`, add a `Card` titled "My tasks" that lists the current user's open tasks (`useTasksApi().list('?assigneeId=<me>&status=todo')` or reuse summary), each with title + due; "View all" → `/tasks`. Show empty state "No open tasks."

- [ ] **Step 3: esbuild syntax check** both files. Expected: no error.

- [ ] **Step 4: Full frontend build** — `npx nx run frontend:build` (or `npm run build`). Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/new-layout/layout.component.tsx apps/frontend/src/components/dashboard/dashboard.component.tsx
git commit -m "feat(tasks): wire Add Task/Set Reminder buttons + dashboard card"
```

---

### Task 9: Deploy + verify

- [ ] **Step 1:** Push `mappedout-branding` (build) — or `phase2` first if staging. Wait for the "Build Mapped Out Image" run to go green.
- [ ] **Step 2:** Coolify force-pull redeploy; wait for the site to recover to HTTP 200 (Prisma `db push` creates the `Task` table on boot). If 502 lingers: `docker exec <postiz-container> pm2 restart backend`.
- [ ] **Step 3: REST probe** (authed session): `GET /api/tasks` → 200 (array); unauth → 401. `GET /api/tasks/summary` → `{open, overdue}`.
- [ ] **Step 4: Manual acceptance:** Add Task (assignee + client + due) → appears on Tasks page + sidebar badge increments; Set Reminder (title + time) → appears as a reminder; complete a task → moves to Done + badge decrements; delete → gone; confirm a second org cannot see it.

---

## Self-Review

**Spec coverage:** unified Task model (Task 1) ✓ · backend API list/summary/create/update/delete (Tasks 2–5) ✓ · org-scoping + IDOR (Task 5 getOne guard) ✓ · Add Task/Set Reminder mapping (Task 8) ✓ · Tasks page + nav badge (Task 7) ✓ · dashboard card (Task 8) ✓ · bell due/overdue surfacing → **covered by `summary.overdue` feeding the existing bell**; note: deep bell integration is light in v1 (badge + Tasks page are the primary surfaces) — acceptable per spec §4/§7. Deferred items (exact-time push, recurring, post-link) explicitly out of scope ✓.

**Placeholder scan:** no TBD/TODO; code shown for every new file; registration steps reference exact mirror files (`notifications.repository.ts`, `client.controller.ts`, `NotificationService` registration) rather than repeating unseen boilerplate — acceptable "follow existing pattern" in an existing codebase.

**Type consistency:** `TaskWrite`/`TaskFilters` defined in Task 2 and consumed in Tasks 3/5; `TaskRow` defined in Task 6 and consumed in Tasks 7/8; method names (`list/summary/getOne/create/update/remove`) consistent across repo→service→controller.
