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

`AiProvider` is a two-method interface (`generateText`, `generateImage`). OpenAI
implements it. Nano Banana is registered but reports itself unavailable until a key
exists — it is visible and honest rather than hidden.

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

## What is deliberately not built yet

- The seven internal skills ship as **registry rows with a stub instruction**.
  Real prompt engineering per skill is the next phase.
- Image generation is wired through the abstraction but Nano Banana has no
  provider implementation, so it reports unavailable.
- Cost-per-model rates are a table in the pure module; they are approximate and
  labelled as such in the UI.
