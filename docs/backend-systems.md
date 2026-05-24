# Backend Systems

This Vite demo app includes a local backend layer for chat streaming, provider
routing, session admission, invite-code redemption, recording export, comparative
measurement, schedule windows, and OVH provisioning.

The backend is mounted from `vite.config.ts` as development middleware. The main
server implementation lives under `src/server`.

## Runtime Entry Points

| Route | Handler | Purpose |
| --- | --- | --- |
| `/api/chat` | `src/server/chatHandler.ts` | Validates chat requests, reserves capacity, streams model output as SSE, and emits provider metadata. |
| `/api/session` and `/api/session/heartbeat` | `src/server/session.ts` | Issues and refreshes session cookies, returns rate-limit metadata, and powers debug UI. |
| `/api/redeem` | `src/server/redeemHandler.ts` | Redeems invite/voucher codes configured through `INVITE_CODES`. |
| `/api/admin/schedule` | `src/server/redeemHandler.ts` | Reads and mutates ad-hoc live schedule windows with admin token or invite-code auth. |
| `/api/recording/export` | `vite.config.ts` | Optional local authoring endpoint for saving replay recordings. |
| `/api/recording/comparative` | `src/server/comparativeRecorder.ts` | Optional local comparative measurement endpoint for Engram vs stateless metrics. |

## Provider Routing

`/api/chat` accepts a provider mode in the request body. If the request does not
include one, the server uses `DEFAULT_PROVIDER_MODE`.

Supported modes:

| Mode | Request shape | Backend behavior |
| --- | --- | --- |
| `stateless-openrouter` | Full conversation history | Uses the configured stateless provider. The mode name is legacy; the actual provider is selected by `STATELESS_PROVIDER`. |
| `simulated-engram` | Engram-like metadata, stateless generation | Uses the stateless provider but reports Engram-shaped metadata so the UI can demonstrate the stateful flow while the real backend is offline. |
| `stateful-engram` | Latest user message plus optional system message | Uses the Clarit/Engram provider at `ENGRAM_BASE_URL`, with conversation ID, turn number, auto snapshot save, and append-only compatibility mode. |

Stateless provider selection is handled in `src/server/env.ts`:

| `STATELESS_PROVIDER` value | Provider |
| --- | --- |
| `nvidia`, `nvidia-nim`, `nim` | NVIDIA NIM |
| anything else or unset | OpenRouter-compatible path |

NVIDIA NIM uses `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_BASE_URL`, and
`NVIDIA_NIM_MODEL`. OpenRouter uses `OPENROUTER_API_KEY`,
`OPENROUTER_BASE_URL`, and `DEFAULT_STATELESS_MODEL`.

Current behavior: provider routing is configuration-selected. There is no
automatic runtime retry from NVIDIA NIM to OpenRouter inside the chat stream if a
generation fails. A failure in the selected provider is returned as an SSE
`error` event or a JSON error before the stream starts.

## Engram Modes

`stateful-engram` requires `ENGRAM_BASE_URL`. It sends only the latest user
message, plus the first system message if present, and relies on Engram
conversation restoration for previous context.

`simulated-engram` is the local/demo fallback. It generates with the configured
stateless provider but returns metadata such as:

- `providerMode: simulated-engram`
- `requestShape: engram-delta`
- deterministic `conversationId`
- `engram.simulated: true`
- `engram.compatibilityResult: simulated`

Simulated mode is useful for demoing the UI, but it does not restore true Engram
state. It should remain visibly labeled in the interface.

## Session Admission, Routing, And Queueing

Before a chat stream starts, `reserveChatCapacity` in `src/server/session.ts`
checks whether the request can run immediately.

The system checks:

- session cookie creation or reuse
- active session count
- global in-flight generation count
- per-session in-flight generation count
- per-session requests per minute
- per-IP requests per minute
- estimated input tokens per request
- queue depth and timeout

Default limits are code defaults, not necessarily values present in `.env.local`:

| Limit | Default |
| --- | ---: |
| `RATE_LIMIT_ENABLED` | `true` |
| `SESSION_TTL_SECONDS` | `3600` |
| `HEARTBEAT_TTL_SECONDS` | `90` |
| `MAX_ACTIVE_SESSIONS` | `5` |
| `MAX_GLOBAL_CONCURRENT_GENERATIONS` | `2` |
| `MAX_SESSION_CONCURRENT_GENERATIONS` | `1` |
| `MAX_REQUESTS_PER_SESSION_PER_MINUTE` | `6` |
| `MAX_REQUESTS_PER_IP_PER_MINUTE` | `18` |
| `MAX_INPUT_TOKENS_PER_REQUEST` | `12000` |
| `SESSION_QUEUE_DEPTH` | `5` |
| `SESSION_QUEUE_TIMEOUT_MS` | `5000` |

When a new session arrives over capacity, it is queued instead of rejected
immediately. Queue entries are persisted in SQLite when `better-sqlite3` is
available. If SQLite is unavailable, queue database operations degrade to no-ops
or zero counts, which keeps the dev server alive but means full queue enforcement
is unavailable.

Queue priority supports voucher classes in the database:

| Code type | Priority rank |
| --- | ---: |
| `investor` | `1` |
| `partner` | `2` |
| `public` | `3` |

Current gap: chat admission currently enqueues as `public`. The request type
contains `codeType`, and the database supports priority, but redeemed voucher
type is not fully wired into queue admission.

## Voucher System

Invite codes are supplied through `INVITE_CODES` as a JSON array:

```json
[
  {
    "value": "DEMO",
    "label": "Public demo",
    "type": "public",
    "maxUses": 50,
    "expiresAt": "2026-06-01T00:00:00.000Z"
  }
]
```

Supported `type` values are `public`, `partner`, and `investor`.

Redemption behavior:

- `/api/redeem` requires a JSON body with `code`.
- the code must exist, be active, be unexpired, and be under `maxUses`
- successful redemption increments the persisted use count
- the response returns the code value, label, and type

Schedule admin access accepts either:

- `Authorization: Bearer <ADMIN_TOKEN>`
- `X-Invite-Code: <valid invite code>`

## Schedule And Availability

Schedule logic lives in `src/server/schedule.ts` and
`src/server/schedule-store.ts`.

The app has a standing weekend live-demo window and optional ad-hoc windows from
`LIVE_SCHEDULE_ADHOC_WINDOWS`.

Availability policies:

| Policy | Meaning |
| --- | --- |
| `open` | The live window is available without a code. |
| `code-required` | A valid code is required. |
| no active window | The schedule state is offline. |

Provisioning state is separate from schedule state. OVH provisioning can report
`none`, `provisioning`, `running`, `terminating`, or `error`, and session
metadata includes that state for the UI. When a live window is active and the
app is over session capacity, the server may attempt to provision an OVH
instance if no instance is already running.

## OVH Provisioning

`src/server/ovhProvision.ts` can provision an OVH AI Training instance during an
active live window.

Required credentials:

- `OVH_APPLICATION_KEY`
- `OVH_APPLICATION_SECRET`
- `OVH_CONSUMER_KEY`

Optional settings:

- `OVH_ENDPOINT`, default `ovh-eu`
- `OVH_INSTANCE_IMAGE`, default `nginx:latest`
- `OVH_INSTANCE_REGION`, default `sbg1`

Provisioning state is persisted in SQLite and reloaded at dev-server startup
when the database is available.

Current behavior: the provisioning hook can start an instance, but provider
routing does not automatically switch chat traffic to the provisioned endpoint.
Treat provisioning as capacity/fail-safe infrastructure unless that routing is
explicitly connected.

## Database

SQLite state is stored at `./data/sessions.db` by default. The database creates
three tables:

- `queue_entries`
- `code_redemptions`
- `provision_state`

The database layer intentionally catches initialization failures so the Vite dev
server can continue running when native SQLite bindings are unavailable.

## Known Architecture Gaps To Resolve

- NVIDIA NIM to OpenRouter fallback is intended by deployment language, but the
  current chat stream path does not perform automatic runtime failover.
- Voucher priority exists in database shape, but chat admission currently queues
  every new over-capacity session as `public`.
- Provisioning state is surfaced and persisted, but provisioned endpoints are not
  currently wired into provider routing.
