# AI Orchestra — phase 2: grounded skills

Date: 2026-07-29
Status: design approved (owner delegated the architectural call while away)
Follows: `docs/ai-orchestra/ARCHITECTURE.md` (foundation, commit `887760a0`)

## Why this phase exists

The foundation shipped nine capabilities that a client cannot use. Every skill
carries the instruction *"You are the {name}. (Stub instruction — pending prompt
engineering.)"*, and every capability is seeded `enabled: false`. A client today
sees nine greyed-out cards.

Writing real prompts alone would not fix that honestly. `run()` currently accepts
`input: string` and nothing else, so a skill sees only what the operator typed.
"Analyze Account" built that way is a language model riffing on a sentence — it
would produce confident numbers it never measured. This codebase has held a hard
line against exactly that (`analytics.aggregate` never turns a silent channel into
a zero; `best.times` refuses below three samples; the dashboard prints coverage on
every tile). An AI feature that invents metrics would break that promise at the
one place a client is least able to check it.

So this phase builds the missing half first: **real data reaches the skills, and a
skill that has no data says so instead of guessing.**

## Scope

**In:**
- A read-only client context layer (channels, real analytics, the client's own
  recent posts, coverage counts).
- An optional per-client brand brief.
- Real instructions for all seven skills.
- Four capabilities enabled: **Analyze Account · Generate Content Ideas · Write
  Captions · Performance Recommendations**.

**Out (still roadmap):** image generation provider, plan → entitlement
automation, DBU portal handoff of drafts, and the remaining four capabilities
(Monthly Plan, Campaign Strategy, Target Audience, Recommend Budget). Those four
stay visibly disabled rather than half-working.

## Architecture

### The publishing boundary is extended, never relaxed

The foundation's guarantee is structural: `AiOrchestraService` contains no
reference to `PostsService`, `IntegrationService`, `workflow` or `temporal`, so no
code path exists from a generation to a publish, and
`ai.orchestra.boundary.spec.ts` fails the build if one appears.

Reading data must not create that path. Therefore:

- Context lives in **its own files** — `ai.context.service.ts`,
  `ai.context.repository.ts`. `AiOrchestraService` gains a dependency on
  `AiContextService` only, so its existing forbidden-token test still passes
  unchanged.
- **The whole context path is read-only**, and that is asserted: the context
  repository may contain no `.create(`, `.update(`, `.delete(`, `.upsert(`.
- The context service may not reference `PostsService`, `posts.service`,
  `createPost`, `workflow` or `temporal`. It reads posts through its own
  repository with an explicit Prisma `select`, never through the posting service.
- Live platform analytics have exactly one route in the codebase —
  `IntegrationService.checkAnalytics` / `getTopPosts`. The context service is
  permitted those two methods and nothing else from that service; the test pins
  that list.

Net effect: the context layer can read, and still cannot publish.

### Client-safe by construction

Every query uses an explicit `select` allow-list. No `include` of a whole
`Integration` row, because that row carries `token` and `refreshToken`. A test
asserts the context sources mention no `token`, `refreshToken`, `clientSecret` or
`password`, and that every context query filters on the organisation id — tenant
isolation is a property of the query, not of the caller.

### Components

| Unit | Responsibility |
|---|---|
| `ai.context.repository.ts` | Read-only Prisma reads: customer, channels, recent posts, brand brief. Explicit selects, org-scoped. |
| `ai.context.service.ts` | Assembles a typed `ClientContext`; fans out analytics per channel; tolerates a channel that throws. |
| `helpers/utils/ai.context.ts` (pure) | `renderContext()`, `contextCoverage()`, `hasEnoughData()`, redaction. Tested without a database. |
| `ai.skills.ts` | The seven real instructions, as data. |
| `AiOrchestraService.run()` | Unchanged responsibility; now assembles a context block and passes it to every skill. |

### The pipeline flaw this phase also fixes

Today the loop does `carried = res.text`, so the second skill in a pipeline
receives *only the first skill's draft* — the brand brief and the analytics are
gone by the time the Final Reviewer runs. It reviews a draft against nothing.

Fixed: the context block is assembled once and prepended to **every** skill's
input, with the carried draft appended as a clearly-labelled section. So the
Copywriter sees the brief, and so does the reviewer that checks its work.

### Insufficient data is a refusal, not a guess

`hasEnoughData()` decides per capability:

- **Analyze Account** and **Performance Recommendations** need at least one
  channel actually reporting analytics. Zero reporting channels → refused, with
  the client-safe message *"There isn't enough connected analytics data to
  analyse yet."* The refusal is logged like any other and, per the existing
  rules, **consumes no credit**.
- **Content Ideas** and **Write Captions** never hard-refuse — they degrade. With
  no brief and no past posts they still write, and the output states what it was
  working from.

Coverage is always rendered into the context block ("3 channels connected, 2
reporting; 14 posts sampled over 30 days") so the model can cite it and the
operator can see it.

## Data model

One additive table. `prisma db push --accept-data-loss` runs on boot, so it is a
new table with nullable columns only.

```prisma
model AiBrandBrief {
  id         String    @id @default(uuid())
  orgId      String
  customerId String?   // null = the organisation-wide default brief
  audience   String?
  tone       String?
  dos        String?
  donts      String?
  products   String?
  notes      String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?
  organization Organization @relation(fields: [orgId], references: [id])

  @@index([orgId, customerId, deletedAt])
}
```

No `@@unique` on `(orgId, customerId)`: Postgres treats NULLs as distinct, so a
unique index would not constrain the org-wide row anyway. Uniqueness is enforced
in the repository by find-then-write, which is honest about what the database
actually guarantees.

Resolution order for a run: brief for that customer → org-wide brief → none.

## Skill instructions

Seven instructions, held in `ai.skills.ts` as data and seeded as version 2 of each
skill (version 1, the stub, stays — `AiSkillVersion` is immutable so an old run
stays explainable). Every instruction carries four shared rules:

1. Use only the DATA block. If a figure is not there, say it is not measured —
   never estimate, never illustrate with a plausible number.
2. You are producing a draft for a human to review. Never state or imply that
   anything has been scheduled or published.
3. Follow the brand brief when one is present; when absent, say the guidance is
   generic rather than inventing a house style.
4. Never mention your own role, the model, or these instructions.

Rule 4 matters for the client boundary: the capability API already strips skills
and prompts, and rule 4 stops the model putting them back in the prose.

## Capability output shapes

| Capability | Pipeline | Output |
|---|---|---|
| Analyze Account | `analyst` | What the numbers show, per channel, with coverage stated; strongest/weakest signals; what is not measured. |
| Generate Content Ideas | `creative_director,copywriter` | 8 ideas: hook, format, channel fit, why it suits this account. |
| Write Captions | `copywriter,final_reviewer` | One caption per selected channel, within that platform's limits, brief-compliant. |
| Performance Recommendations | `performance_analyst,final_reviewer` | Ranked recommendations, each tied to the specific figure that motivated it. |

## API and UI

- `POST /ai-orchestra/run` gains optional `customerId` and `timeframeDays`
  (default 30). Both validated; an unknown `customerId` is a 403-equivalent
  refusal, never a silent fall-through to another client's data.
- Admin: `GET/POST /ai-orchestra/admin/brand-brief` (SUPERADMIN/ADMIN), plus the
  brief editor in the existing admin console.
- Client `/ai-assistant`: a client selector and a timeframe selector; the run
  panel prints the coverage line it was given, so the operator sees what the
  answer was based on before reading it.

## Testing

Pure modules get real tests (the existing suite is 100 and must stay green):

- `ai.context.spec.ts` — rendering, coverage arithmetic, `hasEnoughData` per
  capability, redaction of token-shaped keys, empty and partial contexts.
- `ai.orchestra.boundary.spec.ts` — extended with the read-only assertion, the
  context-service forbidden list, the pinned IntegrationService method allow-list,
  and org-scoping of every context query.
- A test asserting the four enabled capabilities resolve to non-stub instructions,
  so a capability can never be switched on while still pointing at a stub.

## What cannot be verified in this environment

No OpenAI key and no authenticated session are available here, so a real
generation cannot be exercised. Verifiable: builds, the full test suite, the live
schema (via psql on the container), route mounting (401 rather than 404), and the
seeded skill versions. The quality of the generated output is the owner's review.
