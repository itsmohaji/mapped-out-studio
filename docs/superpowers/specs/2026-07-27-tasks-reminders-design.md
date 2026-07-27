# Tasks & Reminders — Design Spec

Date: 2026-07-27
Product: Mapped Out Social Studio (fork of the open-source engine)
Status: Approved scope, pending spec review

## 1. Overview

Make the top-bar **Add Task** and **Set Reminder** buttons real, persistent
features instead of "Coming soon" placeholders. Both are powered by **one
unified `Task` record** — no second subsystem. This gives the agency real
work-tracking (assignable, client-linked tasks with due dates) and lightweight
personal reminders, from a single table/API/UI.

Non-goals (v1): exact-time push notifications, recurring tasks, subtasks,
comments/attachments on tasks, a full kanban board. See §7.

## 2. Data model (Prisma — ADDITIVE ONLY)

One new model in `libraries/nestjs-libraries/src/database/prisma/schema.prisma`,
mirroring the existing org-scoped `Customer` model. `prisma db push
--accept-data-loss` runs on every container boot, so this MUST be a brand-new
table with no changes to existing tables (adding the back-relation array on
`Organization`/`User`/`Customer` is additive and safe).

```prisma
model Task {
  id           String       @id @default(uuid())
  orgId        String
  title        String
  description  String?
  type         String       @default("task")   // "task" | "reminder" (app-governed, NOT a DB enum)
  status       String       @default("todo")    // "todo" | "doing" | "done"
  priority     String?                          // "low" | "medium" | "high" (optional)
  dueAt        DateTime?                         // due date/time
  remindAt     DateTime?                         // optional "remind me at" (surfaced when past, v1)
  completedAt  DateTime?
  assigneeId   String?                           // a User in this org (nullable)
  createdById  String?                           // creator
  customerId   String?                           // optional linked client (Customer)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?                          // soft-delete, like Customer

  organization Organization @relation(fields: [orgId], references: [id])
  assignee     User?        @relation("TaskAssignee", fields: [assigneeId], references: [id])
  createdBy    User?        @relation("TaskCreatedBy", fields: [createdById], references: [id])
  customer     Customer?    @relation(fields: [customerId], references: [id])

  @@index([orgId, status, deletedAt])
  @@index([orgId, assigneeId, deletedAt])
}
```

Rationale for `type`/`status`/`priority` as plain strings (not Prisma enums):
this repo has repeatedly been bitten by enum/CHECK constraints that predate a new
value; app-governed strings let us add values without a schema migration.

## 3. Backend (NestJS) — `apps/backend/src/api/routes/tasks.controller.ts`

New controller + a `TasksService` in the prisma-libraries repository layer,
following the exact pattern of the existing `client`/`Customer` code
(controller → service → `PrismaRepository`). Auth + tenant scoping use the
existing decorators `@GetOrgFromRequest()` and `@GetUserFromRequest()`; **every
query is scoped to `orgId`** and soft-deletes are excluded (`deletedAt: null`),
exactly like `Customer`.

Endpoints (all under the app's `/api` prefix via nginx):
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/tasks` | List org tasks (filters: `status`, `assigneeId=me`, `type`, `customerId`) |
| `GET` | `/tasks/summary` | Counts for the sidebar badge + dashboard (open / due-soon / overdue for the current user) |
| `POST` | `/tasks` | Create (title required; type/assignee/customer/dueAt/remindAt/priority optional) |
| `PUT` | `/tasks/:id` | Update (title/status/assignee/dueAt/…); sets `completedAt` when status→done |
| `DELETE` | `/tasks/:id` | Soft-delete (`deletedAt`) |

Validation via a `CreateTaskDto`/`UpdateTaskDto` (class-validator), mirroring
existing DTOs. IDOR-safe: `:id` operations verify the row's `orgId` matches the
caller's org before mutating.

**Boot-safety:** the new module is self-contained and registered in the API
module the same way as existing route modules; no changes to existing modules'
constructors. A syntax/DI error here would 502 the backend, so it will be
built by copying a working controller/service pair and `node --check`'d, and
staged on the `phase2` image/tag before `:mappedout` where feasible.

## 4. Frontend

- **Shared create modal** `components/tasks/task-form.tsx` (uses the existing
  `useModals`): fields title, description, assignee (org members via existing
  team/users source), client (existing `/integrations/customers`), due date/time,
  priority. **Add Task** opens the full form; **Set Reminder** opens the same
  component in a compact mode (title + remind-at time, assignee defaulted to the
  current user, `type="reminder"`).
- **Top bar** (`new-layout/layout.component.tsx`): re-enable the two buttons —
  `Add Task` → full form, `Set Reminder` → compact form. Remove the disabled/
  "Coming soon" state. Keep `Schedule Post` as-is.
- **Tasks page** `components/tasks/tasks.component.tsx` + route
  `app/(app)/(site)/tasks/page.tsx`, and a **"Tasks" nav item** in the sidebar
  (`top.menu.tsx`, in the Operations group) with a **count badge** (open tasks
  assigned to me) fed by `/tasks/summary`. List with status filter, group by
  To-do/Doing/Done, inline complete + edit + delete. Styled with the existing
  glass-surface cards, matching the demo.
- **Dashboard**: a "Tasks" / "Up next" card already exists; add a compact
  "My open tasks" section reading `/tasks/summary` + latest few tasks (reuses the
  `Card` component).
- **Notification bell**: v1 surfaces **overdue/due-soon** reminders & tasks for
  the current user by including them in the existing notifications feed read
  (no new push infra) — a due/overdue task assigned to me appears as a bell item
  linking to the Tasks page.

## 5. Roles / tenant isolation

- All data is **org-scoped** (`orgId`) — a user only ever sees their org's tasks,
  enforced server-side via `@GetOrgFromRequest()`, identical to `Customer`.
- Assignee/creator are Users within the same org.
- Client (`customerId`) links to a `Customer` in the same org.
- No cross-org exposure; no client-portal exposure (Tasks are internal only —
  the DBU client portal never reads this table).

## 6. Product-name rule

All user-facing strings say "Mapped Out" / generic wording — never the upstream
open-source product name. (Consistent with the branding rule in CLAUDE.md.)

## 7. v1 scope vs deferred

**v1 (this build):** table + API + create modals + Tasks page + sidebar badge +
dashboard card + due/overdue surfacing in the bell (poll-based, no new infra).

**Deferred (v1.1+):** fire a notification at the *exact* `remindAt` time (needs
the Temporal scheduler already in the stack) → a `TasksReminderWorkflow`;
recurring tasks; task comments/attachments; kanban drag-drop; linking a task to a
specific post.

## 8. Testing / verification

- `node --check` on the new controller/service; the frontend compiles via esbuild
  transform + `vite build`.
- Backend boots cleanly (the highest risk): verify `/api/health`-style probe +
  the app serving after deploy; if 502, `pm2 restart backend` per the runbook.
- Manual: create a task (assigned + client + due), see it on the Tasks page +
  sidebar badge; create a reminder (title + time); complete a task; soft-delete;
  confirm another org can't see it (tenant check).
- REST probe after deploy: `/api/tasks` returns 200 for an authed user, 401
  without auth.

## 9. Deployment

Build/deploy via the standard flow (push `mappedout-branding` → GHCR `:mappedout`
build → Coolify force-pull redeploy). The Prisma table is created by `db push` on
container boot (additive). Stage on `phase2` first if a safe window isn't
available, since this is the first backend change.
