# Task C (Plan Tasks 6, 7, 8) — Frontend: task API/form, Tasks page, wired buttons + dashboard card

Branch: `feat/tasks-reminders` (verified with `git branch --show-current` before starting;
never switched). Backend (Tasks 1–5) was already complete on the branch when this session
started (commits `4879dff9`..`cd9f680b`) — confirmed via `git log` + presence of
`tasks.repository.ts`/`tasks.service.ts`/`tasks.controller.ts`/DTOs before touching anything.

## Files created

1. `apps/frontend/src/components/tasks/task.api.ts`
   - `useTasksApi()` → `{ list, summary, create, update, remove }`, plus exported `TaskRow` and
     `TaskSummary` interfaces. Copied from the plan's Task 6 Step 1 code block essentially
     verbatim (added typed return values on the callbacks, no behavior change).

2. `apps/frontend/src/components/tasks/task-form.tsx`
   - `TaskForm({ compact?, task?, onSaved })`.
   - **Full mode**: title, description, assignee (`<select>` sourced from `/settings/team`,
     shape `{users:[{id,role,user:{id,email}}]}` — matches `teams.component.tsx`'s
     `loadTeam()`), client (`<select>` sourced from `/integrations/customers`, same `Customer`
     shape as `clients.component.tsx`), due date/time (`datetime-local`), priority
     (low/medium/high), `type` implicitly `'task'`.
   - **Compact mode** (`compact` prop): title + `remindAt` (`datetime-local`) only,
     `type: 'reminder'`, `assigneeId` defaults to `user?.id` from `useUser()`.
   - Create vs. edit branches on `task?.id`: calls `api.create`/`api.update`, then `onSaved()`
     and `useModals().closeAll()`. Toasts on success/failure via `useToaster()`.
   - Styling copied from `AddClientModal` in `clients.component.tsx` (`glass-surface`-adjacent
     `bg-newBgLineColor`/`border-newTableBorder` inputs), `<select>` styled to match.

3. `apps/frontend/src/components/tasks/tasks.component.tsx`
   - `TasksComponent`: `useSWR('/tasks', () => api.list())`, grouped client-side into
     To-do / Doing / Done glass `Card`s (3-column grid, `xl:grid-cols-3`).
   - Each row: checkbox complete-toggle (`update(id, {status: done<->todo})`), title
     (strikethrough when done), reminder badge for `type==='reminder'`, resolved client name
     (from `/integrations/customers`) and assignee name (from `/settings/team`, "Me" for the
     current user), due/remind date with a red "Overdue" tag when `dueAt < now` and not done,
     edit (opens `TaskForm` — `compact` auto-set from `task.type === 'reminder'`) and delete
     (`deleteDialog()` confirm, then `api.remove`) icon buttons.
   - "+ Add Task" header button opens `TaskForm` (full mode, create).
   - Whole-page empty state ("No tasks yet") plus a per-column "Nothing here." empty state.

4. `apps/frontend/src/app/(app)/(site)/tasks/page.tsx`
   - Route wrapper, copied exactly from the plan's Task 7 Step 2 code block
     (`force-dynamic`, static metadata title "Mapped Out Social Tasks", renders
     `<TasksComponent />`).

## Files modified

5. `apps/frontend/src/components/layout/top.menu.tsx`
   - Added a "Tasks" entry to `firstMenu`, placed immediately after Analytics (no repeated
     `section` key, so it renders under the existing "Insights" group label per the plan's
     "OR add it right after Analytics with section: 'Insights'" option) — clipboard/checklist
     icon, `path: '/tasks'`.
   - `TopMenu` now calls `useFetch()` + `useSWR('/tasks/summary', …, {refreshInterval: 60000})`
     (skipped via `null` key when `user?.orgId` is falsy) and passes
     `badge={item.path === '/tasks' ? taskSummary?.open : undefined}` into `<MenuItem>` for
     every `firstMenu` row. SWR's shared cache means the two `<TopMenu group="first"|"second">`
     instances rendered by `layout.component.tsx` don't double-fetch.

6. `apps/frontend/src/components/new-layout/menu-item.tsx`
   - Added an optional `badge?: number` prop, rendered as a `rounded-full bg-btnPrimary
     text-white text-[10px]` pill next to the label, only inside the existing
     `{!collapsed && (...)}` block — so it's automatically hidden when the sidebar is
     collapsed, per spec, with no extra conditional needed. **Not in the plan's declared file
     list** — see Deviations below for why this was necessary and why it's safe.

7. `apps/frontend/src/components/new-layout/layout.component.tsx`
   - Imported `useModals` and `TaskForm`. Added `openAddTask`/`openSetReminder` callbacks
     (both call `modals.openModal({...})`, one plain `<TaskForm onSaved={() => {}} />`, one
     `<TaskForm compact onSaved={() => {}} />`).
   - Removed `disabled`/`title="Coming soon"`/`opacity-55 cursor-not-allowed` from both the
     **Set Reminder** and **Add Task** buttons and wired their `onClick` to the new callbacks
     (kept every existing responsive/visibility class — `hidden xl:inline-flex` /
     `hidden md:inline-flex` — untouched). **Schedule Post** button left completely as-is
     (still `router.push('/launches')`, accent styling).

8. `apps/frontend/src/components/dashboard/dashboard.component.tsx`
   - Imported `useTasksApi`/`TaskRow` (only the type is used directly; data comes from the
     page's existing generic `load` helper against `/tasks?assigneeId=<user.id>` so it shares
     the same SWR fetcher as every other card on the page).
   - New `myTasksRaw` SWR fetch (skipped via `null` key until `user?.id` resolves) and a
     `myOpenTasks` memo: filters out `status === 'done'` (so both `todo` and `doing` count as
     "open", matching the backend's own `summary()` definition), sorts ascending by `dueAt`
     (undated tasks sort last), takes the first 6.
   - New "My tasks" `Card` inserted at the top of the right-hand column (before "Accounts
     health"): title/action header with a "View all" link to `/tasks`, rows show title + due
     date (`fmtDate`, reused from the existing file) + a red "Overdue" pill when applicable,
     clicking a row navigates to `/tasks`. Empty state: "No open tasks."

## Verification

**esbuild syntax check** (`node_modules/.bin/esbuild <file> --format=esm --jsx=automatic`) on
every new/changed file — all exited 0, no errors:
- `task.api.ts`, `task-form.tsx` (after Task 6)
- `tasks.component.tsx`, `app/(app)/(site)/tasks/page.tsx`, `top.menu.tsx`, `menu-item.tsx`
  (after Task 7)
- `layout.component.tsx`, `dashboard.component.tsx` (after Task 8)

**Typecheck** — `npx tsc --noEmit -p apps/frontend/tsconfig.json`, run after all of Task 6–8
was in place (backgrounded, ~90s):
```
EXIT 0, /tmp/tsc-out.txt is EMPTY (zero errors, zero warnings)
```
No pre-existing errors were observed either, so there was nothing to distinguish "mine" from
"already there" — the whole frontend project typechecks clean with these changes included.

Per the parent instructions, did **not** run a full `next build` (too slow; the CI Docker build
is the stated final gate for that).

## Commits

| Hash | Message |
|---|---|
| `0a3c0372` | `feat(tasks): frontend task api + shared create/edit form` |
| `6ff6c896` | `feat(tasks): Tasks page + route + nav item with live badge` |
| `eb170d3e` | `feat(tasks): wire Add Task/Set Reminder buttons + dashboard card` |

All three commits used `git -c user.name="Mapped Out" -c user.email="hello@mappedout.co"`.
Nothing pushed. Branch unchanged (`feat/tasks-reminders`).

## Deviations from the plan (all believed necessary/safe)

1. **`menu-item.tsx` was modified but isn't in the plan's declared file list.** The plan says
   to "render a live count badge … using a small rounded `bg-btnPrimary text-white text-[10px]`
   pill" on the Tasks nav item, but the shared `MenuItem` component had no way to render
   anything besides icon+label. Rather than fork a one-off "Tasks nav row" component (which
   would duplicate `MenuItem`'s active-state/collapsed/Link-vs-button logic), I added an
   optional `badge?: number` prop. Confirmed via `grep -rln "MenuItem"` that the component is
   only ever imported/rendered from `top.menu.tsx` (the other hit, `title.tsx`, imports the
   *hook* `useMenuItem`, not the component) — so this is a purely additive, backward-compatible
   change with a single call site.
2. **Dashboard "My tasks" card treats both `todo` and `doing` as "open"**, not just `todo`,
   even though the plan's Step 2 example query string was
   `'?assigneeId=<me>&status=todo'`. Went with the plan's parenthetical alternative
   ("or reuse summary") in spirit: `/tasks/summary`'s own `open` count is defined as
   `status: {not: 'done'}`, i.e. todo+doing. Filtering to just `status=todo` would make the
   card's row count silently disagree with the sidebar badge/summary number for any task that's
   `doing`. Fetches unfiltered-by-status (`/tasks?assigneeId=<id>`) and applies the
   not-done filter client-side so the two numbers can't drift apart.
3. **Team-member/assignee source**: used `/settings/team` (exists, returns
   `{users:[{id,role,user:{id,email}}]}`, already consumed by `teams.component.tsx`) rather than
   omitting the assignee dropdown — the plan explicitly allowed either. Displayed value is the
   member's email (there's no separate display-name field on `User`/`user.context.tsx`); the
   current user's own row renders as "Me".
4. **Top-bar `onSaved` callbacks are no-ops** (`() => {}`). Those two modals aren't scoped to any
   particular page's list, so there's nothing local to `mutate()`; `TaskForm` already shows a
   success toast on save, and the Tasks page / Dashboard card each have their own `TaskForm`
   instances with real `mutate()`-based `onSaved` handlers when opened from those surfaces.
5. Route page (`tasks/page.tsx`) uses the plan's literal code block, which hardcodes the title
   string instead of using the `isGeneralServerSide()` pattern seen in `clients/page.tsx` —
   followed the plan's given code verbatim per the "exact code is in the plan" instruction
   rather than "improving" it.

No other files were touched. Did not run/start the app, did not touch backend files, did not
push, did not switch branches.

## Blocking concerns

None. Genuinely clean `tsc --noEmit` across the whole frontend project with all three tasks'
changes included, and every new/modified file passes an isolated esbuild transform. The only
things this session could not verify (out of scope per the parent's instructions — no `next
build`, no running app): actual runtime behavior in a browser, and Task 9's deploy/REST-probe/
manual-acceptance steps, which are explicitly a separate task.
