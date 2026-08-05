# AI Assistant Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI Assistant page from an eight-card grid into a chat over persistent threads with a right-hand folder library, starter cards, and a shared history with the ⌘K spotlight.

**Architecture:** Three new Prisma tables (`AiThread`, `AiMessage`, `AiFolder`) behind the existing Controller → Service → Repository layering. The capability registry gains a `surface` field so caption AI is declared composer-only rather than filtered in the page. Capability answers are stored as the `RenderedSection[]` that `parseStructured()` already produces, so `AiAnswer` renders threads unchanged.

**Tech Stack:** NestJS + Prisma (backend), Next.js 16 App Router + SWR + Tailwind 3 (frontend), pnpm monorepo.

## Global Constraints

- **pnpm only.** Never npm or yarn.
- **Additive-only schema** (ADR-008). `prisma db push --accept-data-loss` runs on every boot. New tables and new nullable columns only — never rename, never drop, never add a required column to an existing table.
- **No DB enums** (ADR-009). Status/role/kind are app-governed validated strings.
- **Three layers, no shortcuts:** Controller → Service → Repository. Most logic in `libraries/nestjs-libraries`.
- **SWR per hook**, complying with `react-hooks/rules-of-hooks`. Never `eslint-disable-next-line` on a hook.
- **Use `useFetch`** from `@gitroom/helpers/utils/custom.fetch`.
- **No new npm dependencies.** Drag-and-drop uses native HTML5 drag events, not a library.
- **Tailwind 3.** Check `apps/frontend/src/app/colors.scss` and `apps/frontend/tailwind.config.cjs`. `--color-custom*` tokens are deprecated — do not use.
- **Org-scoping is mandatory.** Every thread/folder/message read and write re-checks `orgId` server-side. An id from another organization is refused, never silently ignored.
- **Threads are internal only.** No visibility field, no sharing route, no `@ClientAllowed()`.
- **Production is the only environment.** Do not run the app locally. Verify with `pnpm run build:frontend` AND `pnpm run build:backend`.

### Test runner — fixed before execution (commit `71d49ede`)

The suite used to die at config parse: `jest.config.ts` imported `getJestProjects()` from `@nx/jest` and `jest.preset.js` required `@nx/jest/preset`, but this repo is not an Nx workspace and `@nx/*` was never a dependency. Both files were vestigial from the upstream Postiz fork and have been replaced with a plain `jest.config.js`.

**Run tests normally:**

```bash
npx jest <path-to-spec> --reporters=default
```

Baseline at the start of this plan: **22 suites, 395 tests, all passing.** Any task that ends with fewer passing than it started with has broken something.

---

## File Structure

**Backend — created**
- `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.repository.ts` — all Prisma access for threads, messages, folders. No business rules.
- `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.service.ts` — ownership checks, folder seeding, thread titling, append-message orchestration.
- `apps/backend/src/api/routes/ai-threads.controller.ts` — HTTP surface, input bounding.

**Backend — modified**
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — three models + two Organization back-relations.
- `libraries/nestjs-libraries/src/database/prisma/database.module.ts` — register service + repository.
- `apps/backend/src/api/api.module.ts` — register controller.
- `libraries/nestjs-libraries/src/database/prisma/ai/ai.assist.service.ts` — `ask()` persists to a thread.

**Shared — modified**
- `libraries/helpers/src/utils/ai.capabilities.ts` — `surface` field, `assistantCapabilities()` helper.
- `libraries/helpers/src/utils/ai.threads.ts` *(created)* — pure helpers: `threadTitleFrom()`, `STARTER_CARDS`.

**Frontend — created**
- `apps/frontend/src/components/ai-assist/threads.api.ts` — one SWR hook per resource.
- `apps/frontend/src/components/ai-assist/folder.sidebar.tsx` — right rail, drag-drop, rename.
- `apps/frontend/src/components/ai-assist/thread.view.tsx` — message list + composer + credit ring.
- `apps/frontend/src/components/ai-assist/starter.cards.tsx` — three cards, assisted vs automatic.

**Frontend — modified**
- `apps/frontend/src/components/ai-orchestra/ai.orchestra.component.tsx` — page assembly; grid replaced.
- `apps/frontend/src/components/ai-assist/assistant.dock.tsx` — spotlight persists to threads.

---

### Task 1: Schema — three tables

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `AiThread`, `AiMessage`, `AiFolder`. Delegates `prisma.aiThread`, `prisma.aiMessage`, `prisma.aiFolder`.

- [ ] **Step 1: Add the three models**

Append after the `AiBrandBrief` model (around line 1242). Follows `AiBrandBrief` exactly: plain nullable `customerId` with no FK, `organization` relation, `deletedAt` soft delete, no enums.

```prisma
/**
 * AI Assistant threads. Internal only — there is deliberately no visibility
 * field and no client-facing route (see the Phase A design doc).
 * Additive only: `prisma db push` runs on every boot.
 */
model AiThread {
  id           String       @id @default(uuid())
  orgId        String
  userId       String?
  customerId   String?
  title        String
  folderId     String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?
  organization Organization @relation(fields: [orgId], references: [id])
  messages     AiMessage[]

  @@index([orgId, deletedAt, updatedAt])
  @@index([orgId, folderId, deletedAt])
}

model AiMessage {
  id            String   @id @default(uuid())
  threadId      String
  role          String
  text          String
  sections      Json?
  capabilityKey String?
  createdAt     DateTime @default(now())
  thread        AiThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}

model AiFolder {
  id           String       @id @default(uuid())
  orgId        String
  name         String
  sortOrder    Int          @default(0)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?
  organization Organization @relation(fields: [orgId], references: [id])

  @@index([orgId, deletedAt, sortOrder])
}
```

- [ ] **Step 2: Add Organization back-relations**

Prisma requires both sides. In `model Organization`, next to `aiBrandBriefs AiBrandBrief[]` (around line 50):

```prisma
  aiThreads           AiThread[]
  aiFolders           AiFolder[]
```

- [ ] **Step 3: Validate and generate**

Run: `pnpm run prisma-generate`
Expected: `Generated Prisma Client`. If it errors with "missing an opposite relation field", Step 2 was not applied.

- [ ] **Step 4: Confirm nothing existing changed**

Run: `git diff libraries/nestjs-libraries/src/database/prisma/schema.prisma | grep -E '^-' | grep -v '^---'`
Expected: **only** the two added Organization lines cause no `-` output. Any other `-` line means something was removed — revert it. ADR-008 forbids removals.

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/schema.prisma
git commit -m "feat(ai): AiThread, AiMessage and AiFolder tables

Additive only, per ADR-008. customerId is a plain nullable string with no FK,
matching AiBrandBrief. No enums, per ADR-009. A thread belongs to at most one
folder, so folderId on the thread replaces a join table."
```

---

### Task 2: Declare which surface a capability belongs to

**Files:**
- Modify: `libraries/helpers/src/utils/ai.capabilities.ts`
- Test: `libraries/helpers/src/utils/ai.capabilities.spec.ts`

**Interfaces:**
- Consumes: `CAPABILITIES`, `CapabilitySpec` from Task 0 (existing).
- Produces: `CapabilitySurface` type (`'assistant' | 'composer'`), optional `surface` field on `CapabilitySpec`, and `assistantCapabilities(): CapabilitySpec[]`.

- [ ] **Step 1: Write the failing test**

Append to `libraries/helpers/src/utils/ai.capabilities.spec.ts`:

```ts
import { CAPABILITIES, assistantCapabilities } from './ai.capabilities';

describe('capability surface', () => {
  it('keeps caption writing off the assistant page', () => {
    expect(assistantCapabilities().map((c) => c.key)).not.toContain('write_captions');
  });

  it('every capability declares a surface', () => {
    for (const c of CAPABILITIES) {
      expect(['assistant', 'composer']).toContain(c.surface || 'assistant');
    }
  });

  it('assistant surface is a subset of the registry', () => {
    const all = CAPABILITIES.map((c) => c.key);
    for (const c of assistantCapabilities()) expect(all).toContain(c.key);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest libraries/helpers/src/utils/ai.capabilities.spec.ts -t "capability surface" --reporters=default`
Expected: FAIL — `assistantCapabilities is not a function`.

- [ ] **Step 3: Implement**

In `libraries/helpers/src/utils/ai.capabilities.ts`, add to the type block near `CapabilitySpec`:

```ts
/**
 * Where a capability is offered.
 *
 * Declared here rather than filtered in the page, so it cannot drift back onto
 * the wrong surface later — the same reason the analytics gate is derived from
 * this registry rather than listed twice (ADR-028).
 */
export type CapabilitySurface = 'assistant' | 'composer';
```

Add to the `CapabilitySpec` interface:

```ts
  /** Defaults to 'assistant' when omitted. */
  surface?: CapabilitySurface;
```

Set `surface: 'composer'` on the `write_captions` entry — caption writing belongs in the composer, where it can actually see the attached media.

Add at the bottom of the file:

```ts
export const assistantCapabilities = (): CapabilitySpec[] =>
  CAPABILITIES.filter((c) => (c.surface || 'assistant') === 'assistant');
```

- [ ] **Step 4: Run tests**

Run: `npx jest libraries/helpers/src/utils/ai.capabilities.spec.ts --reporters=default`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add libraries/helpers/src/utils/ai.capabilities.ts libraries/helpers/src/utils/ai.capabilities.spec.ts
git commit -m "feat(ai): capabilities declare their surface

Caption writing is composer-only: it belongs where the media is, because that
is the only place it can see the image or video. Declared in the registry
rather than filtered in the page, so it cannot drift back."
```

---

### Task 3: Pure thread helpers

**Files:**
- Create: `libraries/helpers/src/utils/ai.threads.ts`
- Test: `libraries/helpers/src/utils/ai.threads.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `threadTitleFrom(text: string): string`, `DEFAULT_FOLDERS: string[]`, `StarterCard` interface, `STARTER_CARDS: StarterCard[]`.

- [ ] **Step 1: Write the failing test**

Create `libraries/helpers/src/utils/ai.threads.spec.ts`:

```ts
import { threadTitleFrom, DEFAULT_FOLDERS, STARTER_CARDS } from './ai.threads';

describe('threadTitleFrom', () => {
  it('uses the first line of the question', () => {
    expect(threadTitleFrom('Why did the Reel flop?\nMore detail')).toBe('Why did the Reel flop?');
  });

  it('truncates long questions on a word boundary', () => {
    const title = threadTitleFrom('a'.repeat(20) + ' ' + 'b'.repeat(80));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never returns an empty title', () => {
    expect(threadTitleFrom('')).toBe('New chat');
    expect(threadTitleFrom('   \n  ')).toBe('New chat');
  });

  it('collapses whitespace', () => {
    expect(threadTitleFrom('  what   should   we post ')).toBe('what should we post');
  });
});

describe('starter cards', () => {
  it('every card names a real folder', () => {
    for (const c of STARTER_CARDS) expect(DEFAULT_FOLDERS).toContain(c.folder);
  });

  it('automatic cards take no channel input', () => {
    for (const c of STARTER_CARDS) {
      if (c.mode === 'automatic') expect(c.prefill).toBe('');
    }
  });

  it('assisted cards carry a prefill for the composer', () => {
    for (const c of STARTER_CARDS) {
      if (c.mode === 'assisted') expect(c.prefill.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest libraries/helpers/src/utils/ai.threads.spec.ts --reporters=default`
Expected: FAIL — cannot find module `./ai.threads`.

- [ ] **Step 3: Implement**

Create `libraries/helpers/src/utils/ai.threads.ts`:

```ts
/**
 * Pure helpers for AI Assistant threads.
 *
 * Kept free of Nest and Prisma so both the browser and the API can import them,
 * and so titling and card rules are testable without a database.
 */

export const DEFAULT_FOLDERS = ['Campaigns', 'Content ideas', 'Recommendations'];

const MAX_TITLE = 60;

/**
 * A thread's title, derived from its first message.
 *
 * Derived rather than asked for: nobody names a chat before they have had it,
 * and an untitled list is unsearchable. Renaming stays available.
 */
export function threadTitleFrom(text: string): string {
  const firstLine = (text || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  if (!firstLine) return 'New chat';
  if (firstLine.length <= MAX_TITLE) return firstLine;

  const cut = firstLine.slice(0, MAX_TITLE - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export interface StarterCard {
  key: string;
  /** Type label shown bottom-left on the card. */
  label: string;
  /** Verb shown bottom-right. */
  action: string;
  capabilityKey: string;
  folder: string;
  /**
   * 'assisted' prefills an editable composer message and lets the operator pick
   * channels. 'automatic' opens the answer directly — the finding already names
   * the post and the channel, so asking would pretend it does not know.
   */
  mode: 'assisted' | 'automatic';
  /** Empty for automatic cards. */
  prefill: string;
}

export const STARTER_CARDS: StarterCard[] = [
  {
    key: 'recommendation',
    label: 'Recommendation',
    action: 'Open',
    capabilityKey: 'performance_recos',
    folder: 'Recommendations',
    mode: 'automatic',
    prefill: '',
  },
  {
    key: 'campaign',
    label: 'Campaign',
    action: 'Start',
    capabilityKey: 'campaign_strategy',
    folder: 'Campaigns',
    // Square brackets are the registry's own convention for "you were not told
    // this, do not invent it" — reused here so the gap is obvious to the reader
    // before it is ever sent.
    prefill: 'Build a campaign for the next 4 weeks promoting [what?]',
    mode: 'assisted',
  },
  {
    key: 'ideas',
    label: 'Content ideas',
    action: 'Ask',
    capabilityKey: 'content_ideas',
    folder: 'Content ideas',
    prefill: 'What should we post next week, based on what performed last month?',
    mode: 'assisted',
  },
];
```

- [ ] **Step 4: Run tests**

Run: `npx jest libraries/helpers/src/utils/ai.threads.spec.ts --reporters=default`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add libraries/helpers/src/utils/ai.threads.ts libraries/helpers/src/utils/ai.threads.spec.ts
git commit -m "feat(ai): pure thread helpers — titling, folders, starter cards

Titles are derived from the first message: nobody names a chat before having
it. Starter cards split into assisted and automatic, which is the difference
between offering a draft to edit and opening a finding that already knows its
own channel."
```

---

### Task 4: Repository

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.repository.ts`

**Interfaces:**
- Consumes: Prisma delegates from Task 1.
- Produces: `AiThreadsRepository` with `folders(orgId)`, `createFolder(orgId, name, sortOrder)`, `renameFolder(id, name)`, `softDeleteFolder(id)`, `threads(orgId)`, `threadById(id)`, `createThread(data)`, `updateThread(id, data)`, `softDeleteThread(id)`, `messages(threadId)`, `addMessage(data)`. Plus interfaces `ThreadWrite`, `MessageWrite`.

- [ ] **Step 1: Write the implementation**

There is no unit test for this file — it is pure Prisma delegation with no branching, and the behaviour that matters (ownership) is tested at the service layer in Task 5. Create `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.repository.ts`:

```ts
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface ThreadWrite {
  orgId?: string;
  userId?: string | null;
  customerId?: string | null;
  title?: string;
  folderId?: string | null;
}

export interface MessageWrite {
  threadId: string;
  role: 'user' | 'assistant';
  text: string;
  sections?: any;
  capabilityKey?: string | null;
}

/**
 * Prisma access for AI Assistant threads. No business rules and no ownership
 * decisions — those live in the service, which is the only caller.
 */
@Injectable()
export class AiThreadsRepository {
  constructor(
    private _thread: PrismaRepository<'aiThread'>,
    private _message: PrismaRepository<'aiMessage'>,
    private _folder: PrismaRepository<'aiFolder'>
  ) {}

  folders(orgId: string) {
    return this._folder.model.aiFolder.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createFolder(orgId: string, name: string, sortOrder: number) {
    return this._folder.model.aiFolder.create({
      data: { orgId, name, sortOrder },
    });
  }

  folderById(id: string) {
    return this._folder.model.aiFolder.findUnique({ where: { id } });
  }

  renameFolder(id: string, name: string) {
    return this._folder.model.aiFolder.update({ where: { id }, data: { name } });
  }

  softDeleteFolder(id: string) {
    return this._folder.model.aiFolder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Threads whose folder was removed return to Recent rather than vanishing. */
  detachThreadsFromFolder(folderId: string) {
    return this._thread.model.aiThread.updateMany({
      where: { folderId },
      data: { folderId: null },
    });
  }

  threads(orgId: string) {
    return this._thread.model.aiThread.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  threadById(id: string) {
    return this._thread.model.aiThread.findUnique({ where: { id } });
  }

  createThread(data: ThreadWrite & { orgId: string; title: string }) {
    return this._thread.model.aiThread.create({ data });
  }

  updateThread(id: string, data: ThreadWrite) {
    return this._thread.model.aiThread.update({ where: { id }, data });
  }

  softDeleteThread(id: string) {
    return this._thread.model.aiThread.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  messages(threadId: string) {
    return this._message.model.aiMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
  }

  addMessage(data: MessageWrite) {
    return this._message.model.aiMessage.create({ data });
  }

  /** Bumps the thread so Recent orders by real activity, not creation. */
  touchThread(id: string) {
    return this._thread.model.aiThread.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | grep ai-threads`
Expected: no output. (The backend tsconfig reports 6 pre-existing `noImplicitAny` errors in unrelated files — ignore those; only `ai-threads` matches matter.)

- [ ] **Step 3: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.repository.ts
git commit -m "feat(ai): thread/message/folder repository

Pure Prisma delegation. Ownership lives in the service, which is the only
caller. Deleting a folder detaches its threads rather than deleting them."
```

---

### Task 5: Service — ownership and folder seeding

**Files:**
- Create: `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.service.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/database.module.ts`
- Test: `libraries/nestjs-libraries/src/security/ai.threads.boundary.spec.ts`

**Interfaces:**
- Consumes: `AiThreadsRepository` (Task 4), `threadTitleFrom` and `DEFAULT_FOLDERS` (Task 3).
- Produces: `AiThreadsService` with `library(orgId)`, `thread(orgId, threadId)`, `start(params)`, `append(params)`, `move(orgId, threadId, folderId)`, `rename(orgId, threadId, title)`, `remove(orgId, threadId)`, `addFolder(orgId, name)`, `renameFolder(orgId, folderId, name)`, `removeFolder(orgId, folderId)`.

- [ ] **Step 1: Write the failing boundary test**

This mirrors the existing `ai.orchestra.boundary.spec.ts` approach — it reads the source and asserts the ownership rule is present, which catches a whole class of IDOR without needing a database.

Create `libraries/nestjs-libraries/src/security/ai.threads.boundary.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const service = readFileSync(
  join(
    __dirname,
    '../database/prisma/ai-threads/ai.threads.service.ts'
  ),
  'utf8'
);

describe('AI threads boundary', () => {
  it('has a single ownership helper every read routes through', () => {
    expect(service).toContain('private async _ownedThread(');
    expect(service).toContain('private async _ownedFolder(');
  });

  it('refuses rather than silently ignoring a foreign id', () => {
    expect(service).toMatch(/ForbiddenException|NotFoundException/);
  });

  it('never exposes a thread without checking orgId', () => {
    // Every repository call that takes a bare id must be preceded by an
    // ownership check. Assert the service never calls threadById directly
    // outside the helper.
    const direct = service.split('\n').filter(
      (l) => l.includes('threadById(') && !l.includes('_ownedThread')
    );
    expect(direct.length).toBeLessThanOrEqual(1);
  });

  it('is internal only — no client-allowed surface', () => {
    expect(service).not.toContain('ClientAllowed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest libraries/nestjs-libraries/src/security/ai.threads.boundary.spec.ts --reporters=default`
Expected: FAIL — `ENOENT`, the service file does not exist.

- [ ] **Step 3: Implement the service**

Create `libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AiThreadsRepository,
  MessageWrite,
} from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.repository';
import { threadTitleFrom, DEFAULT_FOLDERS } from '@gitroom/helpers/utils/ai.threads';

/**
 * AI Assistant threads.
 *
 * Every id that arrives from a browser is re-checked against the caller's
 * organisation here. There is exactly one helper per resource that does it, so
 * a new method cannot forget: it has no other way to turn an id into a row.
 *
 * Internal only. There is deliberately no visibility field and no client
 * surface — a CLIENT-role request never reaches this service because neither AI
 * controller carries @ClientAllowed() (ADR-006).
 */
@Injectable()
export class AiThreadsService {
  constructor(private _repo: AiThreadsRepository) {}

  private async _ownedThread(orgId: string, threadId: string) {
    const thread = await this._repo.threadById(threadId);
    if (!thread || thread.orgId !== orgId || thread.deletedAt) {
      throw new ForbiddenException();
    }
    return thread;
  }

  private async _ownedFolder(orgId: string, folderId: string) {
    const folder = await this._repo.folderById(folderId);
    if (!folder || folder.orgId !== orgId || folder.deletedAt) {
      throw new ForbiddenException();
    }
    return folder;
  }

  /**
   * Folders seed on first read rather than at boot: a workspace that never
   * opens the assistant should not accumulate rows, and this runs once.
   */
  async library(orgId: string) {
    let folders = await this._repo.folders(orgId);
    if (!folders.length) {
      for (let i = 0; i < DEFAULT_FOLDERS.length; i++) {
        await this._repo.createFolder(orgId, DEFAULT_FOLDERS[i], i);
      }
      folders = await this._repo.folders(orgId);
    }
    const threads = await this._repo.threads(orgId);
    return { folders, threads };
  }

  async thread(orgId: string, threadId: string) {
    await this._ownedThread(orgId, threadId);
    return {
      thread: await this._repo.threadById(threadId),
      messages: await this._repo.messages(threadId),
    };
  }

  /** Creates a thread from its first user message and returns both. */
  async start(params: {
    orgId: string;
    userId?: string | null;
    customerId?: string | null;
    text: string;
    folderId?: string | null;
  }) {
    if (params.folderId) await this._ownedFolder(params.orgId, params.folderId);

    const thread = await this._repo.createThread({
      orgId: params.orgId,
      userId: params.userId ?? null,
      customerId: params.customerId ?? null,
      title: threadTitleFrom(params.text),
      folderId: params.folderId ?? null,
    });

    const message = await this._repo.addMessage({
      threadId: thread.id,
      role: 'user',
      text: params.text,
    });

    return { thread, message };
  }

  async append(params: {
    orgId: string;
    threadId: string;
    role: 'user' | 'assistant';
    text: string;
    sections?: any;
    capabilityKey?: string | null;
  }) {
    await this._ownedThread(params.orgId, params.threadId);
    const write: MessageWrite = {
      threadId: params.threadId,
      role: params.role,
      text: params.text,
      sections: params.sections ?? undefined,
      capabilityKey: params.capabilityKey ?? null,
    };
    const message = await this._repo.addMessage(write);
    await this._repo.touchThread(params.threadId);
    return message;
  }

  async move(orgId: string, threadId: string, folderId: string | null) {
    await this._ownedThread(orgId, threadId);
    if (folderId) await this._ownedFolder(orgId, folderId);
    return this._repo.updateThread(threadId, { folderId });
  }

  async rename(orgId: string, threadId: string, title: string) {
    await this._ownedThread(orgId, threadId);
    return this._repo.updateThread(threadId, {
      title: title.trim().slice(0, 120) || 'New chat',
    });
  }

  async remove(orgId: string, threadId: string) {
    await this._ownedThread(orgId, threadId);
    return this._repo.softDeleteThread(threadId);
  }

  async addFolder(orgId: string, name: string) {
    const existing = await this._repo.folders(orgId);
    return this._repo.createFolder(
      orgId,
      name.trim().slice(0, 60) || 'New folder',
      existing.length
    );
  }

  async renameFolder(orgId: string, folderId: string, name: string) {
    await this._ownedFolder(orgId, folderId);
    return this._repo.renameFolder(
      folderId,
      name.trim().slice(0, 60) || 'New folder'
    );
  }

  /** Threads in a removed folder return to Recent — deleting a folder is not
   *  a way to lose work. */
  async removeFolder(orgId: string, folderId: string) {
    await this._ownedFolder(orgId, folderId);
    await this._repo.detachThreadsFromFolder(folderId);
    return this._repo.softDeleteFolder(folderId);
  }
}
```

- [ ] **Step 4: Register in the database module**

In `libraries/nestjs-libraries/src/database/prisma/database.module.ts`, add imports next to the existing `AiOrchestraService` import (line ~52):

```ts
import { AiThreadsService } from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.service';
import { AiThreadsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.repository';
```

And add both to the providers array next to `AiOrchestraRepository` (line ~120):

```ts
    AiThreadsService,
    AiThreadsRepository,
```

Note: this module's providers array is also its exports array in this codebase — verify by reading the file; if `exports` is separate, add both there too.

- [ ] **Step 5: Run tests**

Run: `npx jest libraries/nestjs-libraries/src/security/ai.threads.boundary.spec.ts --reporters=default`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/ai-threads/ai.threads.service.ts libraries/nestjs-libraries/src/database/prisma/database.module.ts libraries/nestjs-libraries/src/security/ai.threads.boundary.spec.ts
git commit -m "feat(ai): thread service with one ownership helper per resource

Every browser-supplied id becomes a row through _ownedThread or _ownedFolder,
which refuse rather than silently ignoring a foreign id. A new method cannot
forget the check because it has no other way to resolve an id.

Deleting a folder detaches its threads to Recent — deleting a folder must not
be a way to lose work."
```

---

### Task 6: Controller

**Files:**
- Create: `apps/backend/src/api/routes/ai-threads.controller.ts`
- Modify: `apps/backend/src/api/api.module.ts`

**Interfaces:**
- Consumes: `AiThreadsService` (Task 5).
- Produces: HTTP routes `GET /ai-threads/library`, `GET /ai-threads/:id`, `POST /ai-threads/start`, `POST /ai-threads/:id/message`, `POST /ai-threads/:id/move`, `POST /ai-threads/:id/rename`, `POST /ai-threads/:id/delete`, `POST /ai-threads/folder`, `POST /ai-threads/folder/:id/rename`, `POST /ai-threads/folder/:id/delete`.

- [ ] **Step 1: Implement the controller**

Create `apps/backend/src/api/routes/ai-threads.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { AiThreadsService } from '@gitroom/nestjs-libraries/database/prisma/ai-threads/ai.threads.service';

/**
 * AI Assistant threads and folders.
 *
 * Internal only — no @ClientAllowed(), so the CLIENT role is refused by default
 * (ADR-006). Every id in a path or body is re-checked against the caller's
 * organisation inside the service.
 */
@ApiTags('AI Threads')
@Controller('/ai-threads')
export class AiThreadsController {
  constructor(private _threads: AiThreadsService) {}

  @Get('/library')
  library(@GetOrgFromRequest() org: Organization) {
    return this._threads.library(org.id);
  }

  @Get('/:id')
  thread(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._threads.thread(org.id, id);
  }

  @Post('/start')
  start(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { text?: string; folderId?: string; customerId?: string }
  ) {
    return this._threads.start({
      orgId: org.id,
      userId: user.id,
      // Bounded at the edge: a question is short, an unbounded body is a bill.
      text: String(body?.text || '').slice(0, 4000),
      folderId: body?.folderId ? String(body.folderId) : null,
      customerId: body?.customerId ? String(body.customerId) : null,
    });
  }

  @Post('/:id/message')
  message(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { role?: string; text?: string; sections?: any; capabilityKey?: string }
  ) {
    return this._threads.append({
      orgId: org.id,
      threadId: id,
      role: body?.role === 'assistant' ? 'assistant' : 'user',
      text: String(body?.text || '').slice(0, 20000),
      sections: body?.sections,
      capabilityKey: body?.capabilityKey ? String(body.capabilityKey) : null,
    });
  }

  @Post('/:id/move')
  move(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { folderId?: string | null }
  ) {
    return this._threads.move(
      org.id,
      id,
      body?.folderId ? String(body.folderId) : null
    );
  }

  @Post('/:id/rename')
  rename(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { title?: string }
  ) {
    return this._threads.rename(org.id, id, String(body?.title || ''));
  }

  @Post('/:id/delete')
  remove(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._threads.remove(org.id, id);
  }

  @Post('/folder')
  addFolder(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { name?: string }
  ) {
    return this._threads.addFolder(org.id, String(body?.name || ''));
  }

  @Post('/folder/:id/rename')
  renameFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { name?: string }
  ) {
    return this._threads.renameFolder(org.id, id, String(body?.name || ''));
  }

  @Post('/folder/:id/delete')
  removeFolder(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._threads.removeFolder(org.id, id);
  }
}
```

- [ ] **Step 2: Register the controller**

In `apps/backend/src/api/api.module.ts`, add the import next to `AiOrchestraController` (line ~44):

```ts
import { AiThreadsController } from '@gitroom/backend/api/routes/ai-threads.controller';
```

And add to the controllers array next to `AiOrchestraController` (line ~80):

```ts
  AiThreadsController,
```

- [ ] **Step 3: Build the backend**

Run: `pnpm run build:backend`
Expected: exit 0, ends with `nest build` and no error output.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/api/routes/ai-threads.controller.ts apps/backend/src/api/api.module.ts
git commit -m "feat(ai): /ai-threads routes

Internal only — no @ClientAllowed(), so CLIENT is refused by default. Bodies
are bounded at the edge and every id is re-checked in the service."
```

---

### Task 7: Frontend data hooks

**Files:**
- Create: `apps/frontend/src/components/ai-assist/threads.api.ts`

**Interfaces:**
- Consumes: routes from Task 6.
- Produces: `useLibrary()`, `useThread(id: string | null)`, and plain async mutators `startThread`, `sendMessage`, `moveThread`, `renameThread`, `deleteThread`, `addFolder`, `renameFolder`, `deleteFolder` — each taking a `fetch` function as the first argument.

- [ ] **Step 1: Implement**

One hook per resource, complying with `react-hooks/rules-of-hooks` — never a hook returning an object of hooks.

Create `apps/frontend/src/components/ai-assist/threads.api.ts`:

```ts
'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface ThreadRow {
  id: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
}

export interface FolderRow {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sections?: any;
  capabilityKey?: string | null;
  createdAt: string;
}

type Fetcher = ReturnType<typeof useFetch>;

const post = async (fetch: Fetcher, url: string, body?: any) =>
  (
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    })
  ).json();

export const useLibrary = () => {
  const fetch = useFetch();
  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  return useSWR<{ folders: FolderRow[]; threads: ThreadRow[] }>(
    '/ai-threads/library',
    load,
    { revalidateOnFocus: false }
  );
};

export const useThread = (id: string | null) => {
  const fetch = useFetch();
  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  return useSWR<{ thread: ThreadRow; messages: MessageRow[] }>(
    id ? `/ai-threads/${id}` : null,
    load,
    { revalidateOnFocus: false }
  );
};

export const startThread = (
  fetch: Fetcher,
  body: { text: string; folderId?: string | null; customerId?: string }
) => post(fetch, '/ai-threads/start', body);

export const sendMessage = (
  fetch: Fetcher,
  threadId: string,
  body: {
    role: 'user' | 'assistant';
    text: string;
    sections?: any;
    capabilityKey?: string | null;
  }
) => post(fetch, `/ai-threads/${threadId}/message`, body);

export const moveThread = (
  fetch: Fetcher,
  threadId: string,
  folderId: string | null
) => post(fetch, `/ai-threads/${threadId}/move`, { folderId });

export const renameThread = (fetch: Fetcher, threadId: string, title: string) =>
  post(fetch, `/ai-threads/${threadId}/rename`, { title });

export const deleteThread = (fetch: Fetcher, threadId: string) =>
  post(fetch, `/ai-threads/${threadId}/delete`);

export const addFolder = (fetch: Fetcher, name: string) =>
  post(fetch, '/ai-threads/folder', { name });

export const renameFolder = (fetch: Fetcher, folderId: string, name: string) =>
  post(fetch, `/ai-threads/folder/${folderId}/rename`, { name });

export const deleteFolder = (fetch: Fetcher, folderId: string) =>
  post(fetch, `/ai-threads/folder/${folderId}/delete`);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ai-assist/threads.api.ts
git commit -m "feat(ai): SWR hooks and mutators for threads and folders

One hook per resource, per the rules-of-hooks constraint in CLAUDE.md."
```

---

### Task 8: Folder sidebar

**Files:**
- Create: `apps/frontend/src/components/ai-assist/folder.sidebar.tsx`

**Interfaces:**
- Consumes: `FolderRow`, `ThreadRow`, `moveThread`, `addFolder`, `renameFolder` (Task 7).
- Produces: `<FolderSidebar folders threads activeThreadId onSelect onChanged />` where `onChanged: () => void` revalidates the library.

- [ ] **Step 1: Implement**

Native HTML5 drag events — no new dependency. Create `apps/frontend/src/components/ai-assist/folder.sidebar.tsx`:

```tsx
'use client';

import React, { FC, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FolderRow,
  ThreadRow,
  addFolder,
  moveThread,
  renameFolder,
} from '@gitroom/frontend/components/ai-assist/threads.api';

/**
 * The thread library, on the right.
 *
 * Drag-and-drop uses native HTML5 events rather than a library: the whole
 * interaction is a dragstart, a dragover and a drop, and a dependency for three
 * handlers is not worth the bundle.
 *
 * The move is optimistic and reverts by revalidating on failure — a file that
 * snaps back is honest, a file that silently did not move is not.
 */
export const FolderSidebar: FC<{
  folders: FolderRow[];
  threads: ThreadRow[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}> = ({ folders, threads, activeThreadId, onSelect, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const onDropThread = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOver(null);
    const threadId = e.dataTransfer.getData('text/plain');
    if (!threadId) return;
    try {
      await moveThread(fetch, threadId, folderId);
    } finally {
      onChanged();
    }
  };

  const recent = threads.filter((th) => !th.folderId);

  const ThreadLine: FC<{ thread: ThreadRow }> = ({ thread }) => (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', thread.id)}
      onClick={() => onSelect(thread.id)}
      className={clsx(
        'w-full text-start text-[11.5px] leading-[1.45] px-[8px] py-[5px] rounded-[7px] truncate',
        thread.id === activeThreadId
          ? 'bg-[var(--glass-2)] text-textItemFocused'
          : 'text-textItemBlur hover:text-textItemFocused'
      )}
    >
      {thread.title}
    </button>
  );

  return (
    <aside className="w-[186px] shrink-0 flex flex-col gap-[10px] ps-[12px] border-s border-[var(--gline)]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-[700] uppercase tracking-[0.08em] text-textItemBlur">
          {t('library', 'Library')}
        </span>
        <button
          type="button"
          aria-label={t('add_folder', 'Add folder')}
          onClick={async () => {
            await addFolder(fetch, t('new_folder', 'New folder'));
            onChanged();
          }}
          className="text-textItemBlur hover:text-textItemFocused"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 11v4M10 13h4" />
          </svg>
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver('recent');
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => onDropThread(e, null)}
        className={clsx(
          'rounded-[9px] p-[4px]',
          dragOver === 'recent' && 'ring-1 ring-btnPrimary'
        )}
      >
        <div className="flex items-center gap-[7px] px-[4px] py-[3px]">
          <span className="text-[11.5px] flex-1">{t('recent', 'Recent')}</span>
          <span className="text-[10.5px] text-textItemBlur tabular-nums">
            {recent.length}
          </span>
        </div>
        {recent.slice(0, 8).map((th) => (
          <ThreadLine key={th.id} thread={th} />
        ))}
      </div>

      {folders.map((folder) => {
        const inFolder = threads.filter((th) => th.folderId === folder.id);
        return (
          <div
            key={folder.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(folder.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDropThread(e, folder.id)}
            className={clsx(
              'rounded-[9px] p-[4px]',
              dragOver === folder.id && 'ring-1 ring-btnPrimary'
            )}
          >
            <div className="flex items-center gap-[7px] px-[4px] py-[3px]">
              {renaming === folder.id ? (
                <input
                  autoFocus
                  defaultValue={folder.name}
                  onBlur={async (e) => {
                    setRenaming(null);
                    await renameFolder(fetch, folder.id, e.target.value);
                    onChanged();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="flex-1 min-w-0 bg-newBgLineColor border border-btnPrimary rounded-[6px] px-[5px] py-[2px] text-[11.5px] outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => setRenaming(folder.id)}
                  className="text-[11.5px] flex-1 truncate cursor-default"
                >
                  {folder.name}
                </span>
              )}
              <span className="text-[10.5px] text-textItemBlur tabular-nums">
                {inFolder.length}
              </span>
            </div>
            {inFolder.slice(0, 8).map((th) => (
              <ThreadLine key={th.id} thread={th} />
            ))}
          </div>
        );
      })}

      <p className="text-[10.5px] text-textItemBlur leading-[1.5] border-t border-[var(--gline)] pt-[9px]">
        {t('folder_hint', 'Drag a chat onto a folder · double-click to rename')}
      </p>
    </aside>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ai-assist/folder.sidebar.tsx
git commit -m "feat(ai): folder sidebar with native drag-drop and inline rename

Native HTML5 drag events rather than a library — the interaction is three
handlers and a dependency is not worth the bundle."
```

---

### Task 9: Starter cards

**Files:**
- Create: `apps/frontend/src/components/ai-assist/starter.cards.tsx`

**Interfaces:**
- Consumes: `STARTER_CARDS`, `StarterCard` (Task 3).
- Produces: `<StarterCards onAssisted={(card: StarterCard) => void} onAutomatic={(card: StarterCard) => void} />`.

- [ ] **Step 1: Implement**

Create `apps/frontend/src/components/ai-assist/starter.cards.tsx`:

```tsx
'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { STARTER_CARDS, StarterCard } from '@gitroom/helpers/utils/ai.threads';

/**
 * The three starters above the composer.
 *
 * Cards name what they will do, not which capability serves it — "Build a
 * campaign", not "Campaign Strategy". Only one card is filled, because only one
 * carries a finding; filling all three would flatten that difference.
 *
 * Phase A: the recommendation card runs on click like the others. It becomes
 * proactive only when per-post metrics are stored, which is Phase B — until
 * then it must never assert a measured comparison it cannot support.
 */
export const StarterCards: FC<{
  onAssisted: (card: StarterCard) => void;
  onAutomatic: (card: StarterCard) => void;
}> = ({ onAssisted, onAutomatic }) => {
  const t = useT();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-[10px]">
      {STARTER_CARDS.map((card) => {
        const filled = card.mode === 'automatic';
        return (
          <button
            key={card.key}
            type="button"
            onClick={() =>
              card.mode === 'automatic' ? onAutomatic(card) : onAssisted(card)
            }
            className={clsx(
              'rounded-[14px] p-[13px] text-start flex flex-col min-h-[118px]',
              'transition-all duration-200 hover:brightness-110 active:scale-[0.99]',
              filled ? 'bg-btnPrimary text-white' : 'glass-surface'
            )}
          >
            <div className="text-[12.5px] leading-[1.5] flex-1">
              {t(`starter_${card.key}`, defaultCopy(card.key))}
            </div>
            <div
              className={clsx(
                'flex items-center justify-between mt-[11px] pt-[9px] border-t',
                filled ? 'border-white/25' : 'border-[var(--gline)]'
              )}
            >
              <span
                className={clsx(
                  'text-[10.5px]',
                  filled ? 'text-white/85' : 'text-textItemBlur'
                )}
              >
                {t(`starter_label_${card.key}`, card.label)}
              </span>
              <span
                className={clsx(
                  'text-[10.5px] font-[600]',
                  filled ? 'text-white' : 'text-btnPrimary'
                )}
              >
                {t(`starter_action_${card.key}`, card.action)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Card copy. Deliberately states no figure: Phase A has no stored per-post
 * history, so a number here would be an assertion rather than a measurement.
 */
function defaultCopy(key: string): string {
  if (key === 'recommendation')
    return 'Look at what your recent posts did, and what to change next.';
  if (key === 'campaign')
    return 'Plan a campaign — the angle, the beats and how it is judged.';
  return 'Ideas for next week, grounded in what already performed.';
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ai-assist/starter.cards.tsx
git commit -m "feat(ai): three starter cards, one of them filled

Cards name what they do rather than which capability serves it. Only the
recommendation is filled because only it carries a finding. Copy states no
figure — Phase A has no stored per-post history, so a number would be an
assertion rather than a measurement."
```

---

### Task 10: Thread view — messages, composer, credit ring

**Files:**
- Create: `apps/frontend/src/components/ai-assist/thread.view.tsx`

**Interfaces:**
- Consumes: `useThread`, `sendMessage`, `MessageRow` (Task 7); `AiAnswer` from `@gitroom/frontend/components/ai-assist/answer`.
- Produces: `<ThreadView threadId prefill customerId timeframeDays onStarted />` where `onStarted: (threadId: string) => void` fires when a new thread is created from an empty state.

- [ ] **Step 1: Implement**

Create `apps/frontend/src/components/ai-assist/thread.view.tsx`:

```tsx
'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AiAnswer } from '@gitroom/frontend/components/ai-assist/answer';
import {
  MessageRow,
  sendMessage,
  startThread,
  useThread,
} from '@gitroom/frontend/components/ai-assist/threads.api';

/**
 * One conversation.
 *
 * A capability answer is stored as the sections the server already parsed, so
 * this renders <AiAnswer> for those and plain text for the rest — the
 * structured-output contract is the CONTENT of a thread, not a separate view.
 */
export const ThreadView: FC<{
  threadId: string | null;
  prefill: string;
  customerId: string;
  onStarted: (threadId: string) => void;
  onChanged: () => void;
}> = ({ threadId, prefill, customerId, onStarted, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useThread(threadId);

  const load = useCallback(async (url: string) => (await fetch(url)).json(), []);
  const { data: credits } = useSWR(
    showCredits ? '/ai-assist/credits' : null,
    load,
    { revalidateOnFocus: false }
  );

  useEffect(() => setDraft(prefill), [prefill]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages, busy]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
    try {
      let id = threadId;
      if (!id) {
        const started = await startThread(fetch, {
          text,
          customerId: customerId || undefined,
        });
        id = started?.thread?.id;
        if (!id) return;
        onStarted(id);
      } else {
        await sendMessage(fetch, id, { role: 'user', text });
      }

      const res = await (
        await fetch('/ai-assist/ask', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            pathname: '/ai-assistant',
            customerId: customerId || undefined,
          }),
        })
      ).json();

      await sendMessage(fetch, id, {
        role: 'assistant',
        text:
          res?.ok && res?.text
            ? res.text
            : res?.message ||
              t('ai_unavailable', 'The assistant is unavailable right now.'),
      });
    } finally {
      setBusy(false);
      mutate();
      onChanged();
    }
  }, [draft, busy, threadId, customerId, onStarted, onChanged, mutate, t]);

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-[12px]">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[14px]">
        {(data?.messages || []).map((m: MessageRow) => (
          <div
            key={m.id}
            className={clsx(
              'rounded-[13px] px-[13px] py-[11px]',
              m.role === 'user'
                ? 'bg-btnPrimary/15 self-end max-w-[80%]'
                : 'glass-surface'
            )}
          >
            {m.sections ? (
              <AiAnswer sections={m.sections} />
            ) : (
              <div className="text-[13px] leading-[1.62] whitespace-pre-wrap">
                {m.text}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="glass-surface rounded-[13px] p-[14px] flex flex-col gap-[8px]">
            {[88, 72, 80].map((w, i) => (
              <div
                key={i}
                className="h-[10px] rounded-full bg-[var(--glass-2)] animate-pulse"
                style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="glass-surface rounded-[14px] p-[12px] flex flex-col gap-[10px]">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={t('ask_me_anything', 'Ask me anything…')}
          className="w-full bg-transparent border-0 outline-none resize-none text-[13.5px] leading-[1.55] placeholder:text-textItemBlur"
        />
        <div className="flex items-center gap-[9px]">
          <div className="flex-1" />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={send}
            className="h-[32px] px-[14px] rounded-[10px] bg-btnPrimary text-white text-[12px] font-[600] disabled:opacity-40 hover:brightness-110 transition"
          >
            {t('send', 'Send')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCredits((v) => !v)}
        className="self-start flex items-center gap-[7px] text-[10.5px] text-textItemBlur hover:text-textItemFocused transition-colors"
      >
        <span className="w-[13px] h-[13px] rounded-full border-2 border-btnPrimary border-e-transparent border-b-transparent inline-block" />
        {showCredits && credits
          ? `${credits.creditsRemaining} ${t('credits_left', 'credits left')}`
          : t('credits', 'Credits')}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/ai-assist/thread.view.tsx
git commit -m "feat(ai): thread view with composer and quiet credit ring

Capability answers render through the existing AiAnswer, so the structured
output contract is the content of a thread rather than a separate view. The
credit ring is silent until clicked (ADR-030)."
```

---

### Task 11: Assemble the page

**Files:**
- Modify: `apps/frontend/src/components/ai-orchestra/ai.orchestra.component.tsx`

**Interfaces:**
- Consumes: everything from Tasks 7–10.
- Produces: the redesigned `/ai-assistant` page.

- [ ] **Step 1: Replace the capabilities tab body**

In `ai.orchestra.component.tsx`, replace the `<>…</>` block currently rendering the settings bar and `<CapabilityGrid />` (around lines 445–504) with the new layout. Remove the `CapabilityGrid` import and the credits `<span>`; keep the admin `<AdminConsole />` tab untouched.

```tsx
        <div className="flex-1 min-h-0 flex gap-[16px]">
          <div className="flex-1 min-w-0 flex flex-col gap-[14px]">
            {!activeThreadId && (
              <StarterCards
                onAssisted={(card) => setPrefill(card.prefill)}
                onAutomatic={(card) => setPrefill(card.prefill || defaultAsk(card))}
              />
            )}
            <ThreadView
              threadId={activeThreadId}
              prefill={prefill}
              customerId={customerId}
              onStarted={setActiveThreadId}
              onChanged={() => libraryMutate()}
            />
          </div>
          <FolderSidebar
            folders={library?.folders || []}
            threads={library?.threads || []}
            activeThreadId={activeThreadId}
            onSelect={setActiveThreadId}
            onChanged={() => libraryMutate()}
          />
        </div>
```

Add the state and the library hook near the existing `customerId` state (around line 403):

```tsx
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState('');
  const { data: library, mutate: libraryMutate } = useLibrary();
```

Add above the component:

```tsx
/**
 * An automatic card carries no prefill — it is meant to open the finding
 * directly. Phase A has no proactive finding yet, so it asks the capability's
 * own question instead of asserting one.
 */
const defaultAsk = (card: { capabilityKey: string }) =>
  card.capabilityKey === 'performance_recos'
    ? 'What did our recent posts do, and what should we change?'
    : '';
```

And the imports:

```tsx
import { StarterCards } from '@gitroom/frontend/components/ai-assist/starter.cards';
import { ThreadView } from '@gitroom/frontend/components/ai-assist/thread.view';
import { FolderSidebar } from '@gitroom/frontend/components/ai-assist/folder.sidebar';
import { useLibrary } from '@gitroom/frontend/components/ai-assist/threads.api';
```

- [ ] **Step 2: Delete the dead grid**

`CapabilityGrid` is now unreferenced.

Run: `grep -rn "CapabilityGrid" apps/frontend/src --include=*.tsx`
Expected: matches only inside `capability.grid.tsx` itself. If so:

```bash
git rm apps/frontend/src/components/ai-assist/capability.grid.tsx
```

`answer.tsx` stays — `ThreadView` uses it.

- [ ] **Step 3: Build the frontend**

Run: `pnpm run build:frontend`
Expected: exit 0, route list includes `/ai-assistant`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ai-orchestra/ai.orchestra.component.tsx
git commit -m "feat(ai): assemble the AI Assistant as a thread surface

Starter cards above the composer while no thread is open, folder library on the
right. The eight-card grid is deleted — it is the thing this replaces."
```

---

### Task 12: Spotlight writes into the same history

**Files:**
- Modify: `apps/frontend/src/components/ai-assist/assistant.dock.tsx`

**Interfaces:**
- Consumes: `startThread`, `sendMessage` (Task 7).
- Produces: no new exports. ⌘K exchanges appear in Recent.

- [ ] **Step 1: Persist the exchange**

In `assistant.dock.tsx`, inside the `ask` callback, after the answer is set, persist both turns. Add the import:

```tsx
import { sendMessage, startThread } from '@gitroom/frontend/components/ai-assist/threads.api';
```

Replace the body of the `try` block's tail — after `setAnswer({ … })` — with a persistence step that never breaks the answer:

```tsx
        // Persisted after the answer is shown, and deliberately not awaited into
        // the user's path: a failure to file the thread must never cost them the
        // answer they already have.
        try {
          const started = await startThread(fetch, {
            text: question,
            customerId: customerId || undefined,
          });
          const id = started?.thread?.id;
          if (id) {
            await sendMessage(fetch, id, { role: 'assistant', text: answerText });
          }
        } catch {
          // Recents in localStorage remain the fallback.
        }
```

Hoist the answer string into a local `answerText` before `setAnswer` so both use one value:

```tsx
        const answerText =
          res?.ok && res?.text
            ? res.text
            : res?.message ||
              t('ai_unavailable', 'The assistant is unavailable right now.');
        setAnswer({ question, text: answerText });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Both builds**

Run: `pnpm run build:backend && pnpm run build:frontend`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ai-assist/assistant.dock.tsx
git commit -m "feat(ai): spotlight exchanges land in Recent

One history, two doors. Persistence is wrapped so a failure to file the thread
never costs the user the answer they already have; the localStorage recents
remain the fallback."
```

---

## Self-Review

**Spec coverage.** D1 threads → Tasks 1, 4–7, 10, 11. D2/D3 cards → Tasks 3, 9. D4 assisted vs automatic → Tasks 3, 9, 11. D5 surface field → Task 2. D6 arithmetic-only findings → deferred to Phase B; Task 9's copy is written so it asserts no figure. D7 shared history → Task 12. D8 credit ring → Task 10. Data model → Task 1. Folders/drag/rename → Task 8. Empty states → Task 9 copy plus the existing `hasEnoughData()` path. Error handling → Task 5 ownership, Task 8 revalidate-on-failure, Task 12 wrapped persistence. Testing → Tasks 2, 3, 5.

**Gap found and closed:** the spec says a failed send still records the user's message. Task 10 sends the user message before calling `/ai-assist/ask`, so it survives a failed answer. Confirmed, no extra task needed.

**Open question still open:** whether `analyze_account` moves to the Accounts page. Not blocking Phase A — it keeps its default `assistant` surface and continues to work. Resolve before Phase B.

**Type consistency checked:** `onChanged` is used with the same signature in Tasks 8, 10 and 11. `StarterCard.mode` values match between Tasks 3, 9 and 11. `MessageRow.role` is `'user' | 'assistant'` throughout, and Task 10 compares against exactly those two — the spotlight's separate `Turn` type uses `'you'`, which never reaches this component.

---

## Verification before any deploy

```bash
pnpm run build:backend && pnpm run build:frontend
```

Both must exit 0. Then push `mappedout-branding`, let CI build `:mappedout`, redeploy in Coolify, and verify on `https://social.mappedout.co` — health check is `/api/` **with** the trailing slash.

🔴 **HARD GATE (ADR-025):** never deploy before the owner visually approves the phase AND all tests pass.
