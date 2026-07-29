# AI Orchestra — architecture

Status: **foundation shipped**. Skills and capabilities are data, not code, so new
ones are added by an admin without touching this architecture.

## The one rule everything else serves

**AI never publishes.** The orchestrator produces *content*, nothing more. It has
no reference to the posting service, no scheduling call, no integration token.
The flow stays:

```
AI generation → internal review → DBU portal client approval → scheduling → publishing
```

This is enforced structurally, not by convention: `AiOrchestraService` depends on
the provider registry and the run log. It cannot reach `PostsService`, so there is
no code path from a generation to a publish. A test asserts that.

## What a client sees vs what exists

| Client sees | Internally |
|---|---|
| **Capabilities** — "Generate Content Ideas", "Write Captions" | an ordered pipeline of **skills** |
| Remaining credits for the month | per-run token + cost accounting |
| Nothing else | prompts, models, providers, skill versions, costs |

Clients never see a prompt, a skill name, a model, or a file. The capability API
returns only: key, name, description, whether it is available to them, and why not
if it is not.

## Data model (all additive, all nullable-safe)

`prisma db push --accept-data-loss` runs on every boot, so every table here is new
and every column added to an existing table is nullable.

- **`AiSkill`** — the registry. One row per internal specialist (Copywriter, Art
  Director…). Holds provider + model + whether it is active. Never exposed.
- **`AiSkillVersion`** — immutable versions of a skill's instruction. A run records
  the exact version it used, so an output can always be explained later.
- **`AiCapability`** — the client-facing unit. Holds an ordered `skillKeys` list,
  the minimum plan, and an `enabled` flag so an unfinished capability can ship
  visibly disabled rather than silently missing.
- **`AiRun`** — the audit log and the meter in one. Every attempt is recorded,
  including refusals, with provider, model, tokens, cost and status.
- **`AiEntitlement`** — per-organisation monthly credit and image limits. Absent
  row = the plan default, so nothing breaks for an org that has never been
  configured.

## Provider abstraction

`AiProvider` is a **one-method** interface today (`generateText`). OpenAI
implements it. Nano Banana is registered but reports itself unavailable until a key
exists — it is visible and honest rather than hidden.

Image generation is **not** part of this interface yet, so the `generate_images`
capability stays disabled. `OpenaiService.generateImage` and
`FalService.generateImageFromText` already exist elsewhere in the codebase and are
what a future `generateImage` would wrap.

Adding a provider means adding one file and one registry entry. No orchestration
code changes.

## Entitlement and metering

The rules live in a pure module (`libraries/helpers/utils/ai.orchestra.ts`) with
tests, because they decide whether someone is allowed to spend money:

- a capability must be `enabled` **and** within the org's plan
- a run is refused when the month's credits are exhausted — and the refusal is
  still logged, so "why did nothing happen" is answerable
- image generations count against a separate, smaller limit
- cost is computed from the provider's own token counts; when a provider reports
  no usage we record `null`, never a guess

## Phase 2 — grounded skills

A skill used to see only what the operator typed, which would have made
"Analyze Account" a language model inventing numbers. Phase 2 put real data
underneath the skills first, then wrote the instructions.

**The context layer.** `AiContextService` assembles a `ClientContext` — connected
channels, live platform analytics, the account's own published posts, and the
brand brief if one exists. `helpers/utils/ai.context.ts` renders it into the DATA
block and is where the honesty rules live: a channel that reported nothing is
"not reporting" and never a zero, followers are the latest level and never a sum,
and a percentage change appears only when the platform supplied one. It reuses
`analytics.aggregate`, so a figure the AI quotes matches the dashboard by
construction.

**The boundary was extended, not relaxed.** Reading must not become a route to
writing, so: the context repository contains no create/update/delete/upsert at
all; it never selects `token`, `refreshToken` or `customInstanceDetails`; every
query is org-scoped; and it borrows exactly one method from `IntegrationService`
(`checkAnalytics`, the codebase's only route to live platform numbers). All four
are asserted in `ai.orchestra.boundary.spec.ts`. Brand-brief *writes* live in
`AiOrchestraRepository` with the other admin config precisely so the run path
stays provably read-only.

**Refusal beats a guess.** Analyze Account and Performance Recommendations refuse
when no channel is reporting. The refusal is logged and consumes no credit.
Writing capabilities degrade instead — they still work, and say what they had.

**Every skill now sees the data.** The pipeline used to replace its input with the
previous skill's text, so the Final Reviewer checked a draft against nothing. The
DATA block is now prepended to every step, with the carried draft appended.

**Enabled:** Analyze Account · Generate Content Ideas · Write Captions ·
Performance Recommendations. `ENABLED_CAPABILITIES` in `helpers/utils/ai.skills.ts`
is the single source of truth, and a test asserts every skill it names has a real
instruction — so a capability can never go live pointing at a stub.

## What is deliberately not built yet

- **Four capabilities remain disabled**: Monthly Plan, Campaign Strategy, Target
  Audience, Recommend Budget. Their skills have real instructions; each still
  needs its own output shape and empty state.
- **Image generation.** See the provider note above.
- **Plan → entitlement automation.** Credits still come from an explicit
  `AiEntitlement` row or the 200/20 default, not from the subscription tier.
- **DBU portal handoff.** A draft is copied by hand today; it does not yet flow
  into the portal approval path.
- Cost-per-model rates are a table in the pure module; they are approximate and
  labelled as such in the UI.
