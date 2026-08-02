# Automation Module — Design

**Date:** 2026-08-02
**Repo:** `itsmohaji/postiz-app`, branch `mappedout-branding`
**Status:** approved by owner (decisions delegated — see Decision Log)

A workflow engine, not an AI feature. Triggers → conditions → actions, evaluated as
data. AI is a future action type behind the same interface, and nothing in the core
depends on it.

---

## 1. Platform capability verification

Verified against vendor documentation on 2026-08-02. **This section is the contract.**
The engine never offers a capability a platform does not officially support.

### Instagram — `instagram-standalone` (Instagram API with Instagram Login)

Our provider is `instagram-standalone`, which authenticates against
`graph.instagram.com` with no linked Facebook Page. Its declared scopes today
(`instagram.standalone.provider.ts:31`):

```
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_comments
instagram_business_manage_insights
```

| Capability | Supported | Webhook field | Scope required | Have it? |
|---|---|---|---|---|
| Receive new comments | Yes | `comments` | `instagram_business_manage_comments` | **Yes** |
| Reply to a comment | Yes | — | `instagram_business_manage_comments` | **Yes** |
| Receive DMs | Yes | `messages` | `instagram_business_manage_messages` | **No** |
| Send DMs | Yes | — | `instagram_business_manage_messages` | **No** |
| Private reply to a comment | Yes | — | `instagram_business_manage_messages` | **No** |
| Story mention | Yes | via `comments` payload | `instagram_business_manage_comments` | Yes |
| New follower | **No** — no such webhook exists | — | — | — |
| Message reactions / seen / postbacks | Yes | `message_reactions`, `messaging_seen`, `messaging_postbacks` | `instagram_business_manage_messages` | No |

**Three blockers, all external:**

1. `instagram_business_manage_messages` must be added to the provider scope list.
2. It requires **Advanced Access via Meta App Review** because we manage accounts we
   do not own. Owner action, real lead time.
3. Adding a scope does not upgrade existing tokens. **Every already-connected
   Instagram account must re-authorize.** The UI must detect and prompt for this.

**Private reply mechanics — these shape the product, not just the code:**

- Endpoint: `POST https://graph.instagram.com/v23.0/<IG_ID>/messages`
  with `recipient: { comment_id }`.
- **One private reply per comment. Ever.** Not per day — ever.
- **7 days** from comment creation. (Instagram Live: only during the broadcast.)
- **It does not open a messaging window.** The user must reply before we may send
  anything else. Once they do, a standard **24-hour window** opens.
- Outside 24h, only `HUMAN_AGENT`-tagged messages, and only for genuine human handoff.
- Only works on comments on **our own** media.

The owner's requested flow is therefore, precisely:

```
comment "YES"  →  ONE private reply  →  [engine waits, possibly forever]
               →  user replies       →  24h window opens
               →  collect fields     →  create lead  →  notify AM
```

The wait is a first-class state, not a sleep. Most contacts will never reply, and the
engine must hold those conversations open cheaply and expire them cleanly.

### All channels

| Platform | Comments in | Comment reply | DM in | DM out | Verdict |
|---|---|---|---|---|---|
| **Instagram** | Yes | Yes | Yes¹ | Yes¹ | Full |
| **Facebook** | Yes | Yes | Yes (Messenger) | Yes + private replies | Full |
| **WhatsApp** | n/a | n/a | Yes (Cloud API) | Yes² | Full |
| **Website Chat** | n/a | n/a | Yes (ours) | Yes | Full — no gatekeeper |
| **TikTok** | **No** | **No** | **No** | **No** | Not buildable |
| **LinkedIn** | Partial³ | Partial³ | **No** | **No** | Not buildable |

¹ Requires Advanced Access.
² 24h customer-service window; outside it, only pre-approved templates.
³ Community Management API: registered organizations only, two-tier review with a
  screencast, 12-month upgrade deadline. No general messaging API — LinkedIn's
  partner-only Messages API requires a non-automated member action per message,
  which is definitionally incompatible with a workflow engine.

**TikTok and LinkedIn ship as adapters that declare zero automation capability.**
They appear in the channel list greyed out with the reason stated. We do not build UI
that implies an automation we cannot deliver.

---

## 2. Architecture

Four layers. Only the adapter layer knows a platform exists.

```
Platform  →  Ingress          normalize + verify + dedupe  →  AutomationEvent
          →  Engine           match trigger → eval conditions → plan actions
          →  Actions          execute, or suspend on a wait
          →  Adapters         the only code that speaks HTTP to a platform
```

### Channel-agnostic by capability declaration

Every adapter declares what it can do. The engine asks; it never assumes.

```ts
interface ChannelAdapter {
  readonly channel: ChannelKey;
  capabilities(): ChannelCapabilities;   // static truth about the platform
  parseWebhook(raw): AutomationEvent[];
  verifySignature(raw, headers, secret): boolean;
  send(action, ctx): Promise<SendResult>;
}
```

A workflow referencing an unsupported capability fails **validation at save time**
with a plain-English reason, not silently at 3am. This is what makes
"channel-agnostic" real rather than aspirational: adding TikTok DMs the day TikTok
ships them is one adapter method and a capability flag.

### Per-client isolation

`Customer` already exists and `Integration.customerId` already links a channel to a
client. Every automation row carries `customerId`. Isolation is a scope on every
query, enforced in the repository, not a new subsystem.

### Why the wait is Temporal

A DM flow waits an unbounded time for a human. Temporal is already in the stack,
powers all scheduled publishing, and gives durable timers plus signals. A contact
reply is a signal; a 7-day expiry is a timer. Building this on cron polling would
mean scanning every open conversation every minute forever.

---

## 3. Data model

Additive only. `prisma db push --accept-data-loss` runs on every container boot, so
no column is ever renamed or removed. No enums — this project has been bitten four
times by enumerated constraints that predated a new value (CRM stage, scope/country,
`alerts.category`, `invoices.status`). Status fields are app-governed strings.

| Model | Purpose |
|---|---|
| `AutomationWorkflow` | Trigger + graph + status, scoped `orgId` + `customerId`. |
| `AutomationNode` | One node of the graph. Kind, config JSON, ordering, parent/branch edge. |
| `AutomationContact` | A person, per client, per channel. Handle, platform id, fields, tags. |
| `AutomationConversation` | Live run state: workflow, contact, cursor node, window expiry. |
| `AutomationEvent` | Every inbound platform event. Dedupe key, raw payload, processed flag. |
| `AutomationRun` | One execution: what fired, what matched, what each action returned. |
| `AutomationTemplate` | Reusable message with `{{variable}}` interpolation. |
| `AutomationPostBinding` | Binds a workflow to a specific published post (IG media id). |

`AutomationEvent` is deliberately persisted **before** processing. Meta retries
webhooks; without a stored dedupe key on `(channel, externalId)` a retry sends the
DM twice. That unique index is the correctness boundary.

---

## 4. Engine

Pure functions over data, no I/O — so it is unit-testable without a database, a
browser, or a live Instagram account.

```ts
matchTrigger(event, workflows) → workflows whose trigger fires
evaluateConditions(conditions, ctx) → boolean
planActions(workflow, cursor, ctx) → Action[] | { suspend: WaitSpec }
```

**Triggers** (v1 built: ★): ★comment, ★direct message, story mention, keyword,
form submission, webhook, manual. *New follower is omitted — no platform we support
offers that webhook. Building it would be a lie in the UI.*

**Conditions:** keyword (equals / contains / regex, case- and diacritic-insensitive),
language, platform, campaign, specific post, business hours, customer type, tags,
variable comparison.

**Actions** (v1 built: ★): ★send DM, ★reply to comment, ★send template, ★wait for
reply, ★branch, ★create lead, create task, ★notify team, assign account manager,
call webhook. `generateAiResponse` is registered as a known kind that returns
`unavailable` — the seam exists, nothing depends on it.

**Keyword matching** normalizes case, trims, strips emoji and diacritics, and matches
on word boundaries. "YES", "yes!", "Yes 🙌", "  yes" all match `YES`. "yesterday"
does not.

---

## 5. Slice 1 scope

Ships: Instagram comment trigger → keyword condition → private reply → wait for
reply → collect fields → create lead (local + DBU push) → notify team. Step-list
builder. Per-client workspace. Post binding from composer and Post Library.

**Capability gating:** the comment path needs no new permission and is verifiable
today. Everything DM-shaped is behind `instagramCapabilities()`, which reads the
integration's granted scopes. Before Advanced Access it reports `canSendDm: false`,
the UI shows the reason and a re-authorize prompt, and the engine records the run as
blocked rather than failing. The day the scope lands, it flips on with no code change.

Deferred to later slices: drag canvas, Knowledge Base, Analytics dashboards, Facebook
/ WhatsApp / Website Chat adapters, AI fallback.

---

## 6. Decision Log

Owner delegated ("i wont be around i trust your decision so you are the leader").

| Decision | Choice | Why |
|---|---|---|
| First slice | Instagram comment→DM end to end | The one flow he named. Engine shape falls out of a real use case rather than being guessed. |
| App Review sequencing | Comment side live now, DM behind capability flag | Meta's calendar does not block our build. |
| Lead storage | Local `AutomationContact`, push to DBU CRM on qualify | Multi-step DM flows need local state anyway; DBU stays sales source of truth; survives DBU's ~5-min deploy outages. |
| Builder UI | Vertical step list, stored as a graph | Working automation weeks sooner. Canvas is a second view over identical data, no migration. |
| Wait implementation | Temporal | Already in stack; durable timers + signals are exactly this problem. |
| New Follower trigger | **Not built** | No supported platform offers the webhook. |
| TikTok / LinkedIn | Adapters declaring zero capability | The APIs do not exist. Greyed out with the reason shown. |

---

## 7. Owner actions (blocking, cannot be done from code)

1. **Submit Meta App Review** for `instagram_business_manage_messages` (Advanced
   Access). Gates every DM capability.
2. **Set `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`** and **`INSTAGRAM_APP_SECRET`** in Coolify.
   The receiver rejects unsigned payloads — without the secret it accepts nothing.
3. **Register the callback URL** in the Meta App dashboard:
   `https://social.mappedout.co/api/hooks/instagram`, subscribing `comments` (and
   `messages` once approved).
4. **Re-authorize connected Instagram accounts** after the scope is added.
