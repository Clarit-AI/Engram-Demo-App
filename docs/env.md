# Environment Variables

The project loads environment variables in `vite.config.ts` with:

```ts
{
  ...loadEnv(mode, process.cwd(), ''),
  ...process.env,
}
```

That means values can come from Vite env files in the repo root, such as
`.env`, `.env.local`, `.env.development`, or `.env.development.local`, and from
the shell process environment. The shell environment wins if the same key exists
in both places.

Only `.env.example` and `.env.local` exist in the current working tree. The local
`.env.local` is intentionally sparse; most variables below are optional knobs or
feature-specific settings with code defaults.

## Locally Set In `.env.local`

The current `.env.local` contains values for these keys. Secret values are not
listed here.

- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `VITE_DEFAULT_MODEL`
- `DEFAULT_STATELESS_MODEL`
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`
- `STATELESS_PROVIDER`
- `VITE_SESSION_DEBUG`
- `VITE_ENABLE_RECORDING_EXPORT`
- `VITE_DEV_BYPASS_AVAILABILITY`

Everything else in this reference is either documented in `.env.example`, read
from the shell environment when present, injected by Vite, or falling back to a
code default.

## Provider Configuration

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `DEFAULT_PROVIDER_MODE` | `stateless-openrouter` | server | Default chat provider mode when the request body omits `mode`. Supported values are `stateless-openrouter`, `simulated-engram`, and `stateful-engram`. |
| `STATELESS_PROVIDER` | OpenRouter path | server and injected client label | Selects the stateless provider. `nvidia`, `nvidia-nim`, and `nim` route to NVIDIA NIM. Any other value routes to OpenRouter-compatible behavior. |
| `OPENROUTER_API_KEY` | none | server | Required when stateless routing uses OpenRouter. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | server | OpenRouter-compatible base URL. |
| `DEFAULT_STATELESS_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | server | Fallback stateless model for OpenRouter and general model selection. |
| `NVIDIA_NIM_API_KEY` | none | server | Required when `STATELESS_PROVIDER` selects NVIDIA NIM. |
| `NVIDIA_NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | server | NVIDIA NIM OpenAI-compatible base URL. |
| `NVIDIA_NIM_MODEL` | `DEFAULT_STATELESS_MODEL` | server | Model used for NVIDIA NIM. Takes precedence over request model and `DEFAULT_STATELESS_MODEL`. |
| `ENGRAM_BASE_URL` | none | server | Required for `stateful-engram`. |
| `ENGRAM_API_KEY` | none | server | Optional Engram API key passed to the Clarit provider. |
| `ENGRAM_ADMIN_API_KEY` | none | server | Optional Engram admin key passed to the Clarit provider. |
| `ENGRAM_MODEL` | `DEFAULT_STATELESS_MODEL` | server | Model used for real Engram requests. |

## DigitalOcean Comparative Measurement

These variables are for the optional comparative recorder, not the normal chat
path.

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `DIGITALOCEAN_MODEL_ACCESS_KEY` | none | comparative recorder | Preferred DigitalOcean serverless inference key. |
| `DIGITALOCEAN_TOKEN` | none | comparative recorder | Accepted alias when `DIGITALOCEAN_MODEL_ACCESS_KEY` is absent. |
| `DIGITALOCEAN_INFERENCE_BASE_URL` | code constant | comparative recorder | DigitalOcean inference endpoint. |
| `DIGITALOCEAN_INFERENCE_MODEL` | comparative model fallback | comparative recorder | Stateless model used for comparative measurement. |

## Session, Rate Limit, And Queue Configuration

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `true` | server | Enables or disables the admission and rate-limit checks. |
| `RATE_LIMIT_DEBUG` | none | declared only | Present in types/example, but no current behavior was found. |
| `SESSION_DEBUG` | `false` | server | Adds debug flag to `/api/session` response. |
| `SESSION_COOKIE_NAME` | `ngram_demo_session` | server | Session cookie name. The default is a legacy name. |
| `SESSION_COOKIE_SECURE` | auto by request protocol | server | Forces Secure cookies when truthy. If unset, Secure is used only for HTTPS requests. |
| `SESSION_TTL_SECONDS` | `3600` | server | Session cookie and server session lifetime. |
| `HEARTBEAT_TTL_SECONDS` | `90` | server | Window used to count a session as active after its last heartbeat. |
| `MAX_ACTIVE_SESSIONS` | `5` | server | Active-session cap before new sessions enter the queue. |
| `MAX_GLOBAL_CONCURRENT_GENERATIONS` | `2` | server | Global in-flight generation cap. |
| `MAX_SESSION_CONCURRENT_GENERATIONS` | `1` | server | Per-session in-flight generation cap. |
| `MAX_REQUESTS_PER_SESSION_PER_MINUTE` | `6` | server | Per-session request-rate cap. |
| `MAX_REQUESTS_PER_IP_PER_MINUTE` | `18` | server | Per-IP request-rate cap. |
| `MAX_INPUT_TOKENS_PER_REQUEST` | `12000` | server | Estimated input-token cap. Estimation is currently character-count based. |
| `SESSION_QUEUE_DEPTH` | `5` | server | Maximum queue depth. |
| `SESSION_QUEUE_TIMEOUT_MS` | `5000` | server | Maximum time a queued request waits. |

## Access, Vouchers, And Schedule

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `INVITE_CODES` | none | server | JSON array of redeemable codes. Each entry can include `value`, `label`, `type`, `maxUses`, and `expiresAt`. |
| `LIVE_SCHEDULE_ADHOC_WINDOWS` | none | server | JSON array of schedule windows with `label`, `start`, `end`, and `policy`. |
| `ADMIN_TOKEN` | none | server | Bearer token for schedule admin routes. |

## OVH Provisioning

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `OVH_APPLICATION_KEY` | none | server | Required to provision OVH AI Training instances. |
| `OVH_APPLICATION_SECRET` | none | server | Required to provision OVH AI Training instances. |
| `OVH_CONSUMER_KEY` | none | server | Required to provision OVH AI Training instances. |
| `OVH_ENDPOINT` | `ovh-eu` | server | OVH API endpoint. |
| `OVH_INSTANCE_IMAGE` | `nginx:latest` | server | Image used for provisioned instances. |
| `OVH_INSTANCE_REGION` | `sbg1` | server | OVH region for provisioned instances. |

## Client/Public Variables

Only `VITE_` variables are available to browser code. Do not put secrets in
these values.

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `VITE_CHAT_API_URL` | `/api/chat` | client | Chat API endpoint. |
| `VITE_SESSION_API_URL` | `/api/session/heartbeat` | client | Session heartbeat endpoint. |
| `VITE_DEFAULT_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | client | Model label/request value used by live chat. |
| `VITE_STATEFUL_PROVIDER_MODE` | `simulated-engram` | client | Chooses `stateful-engram` or `simulated-engram` for the stateful UI mode. Any value other than `stateful-engram` becomes `simulated-engram`. |
| `VITE_SESSION_DEBUG` | `false` | client | Shows session/debug UI components. |
| `VITE_DEV_BYPASS_AVAILABILITY` | `false` by absence | client | Dev-only bypass for availability gating in the header. |
| `VITE_ENABLE_RECORDING_EXPORT` | `false` | client | Shows recording export controls. |
| `VITE_CONSENT_MODAL_TITLE` | `Cookie consent` | client | Consent modal title. |
| `VITE_CONSENT_MODAL_DESCRIPTION` | built-in copy | client | Consent modal description, supports configured HTML. |
| `VITE_CONSENT_MODAL_ACCEPT` | `Accept` or `Start the simulation` | client | Consent accept button text. |
| `VITE_CONSENT_MODAL_FOOTER` | empty | client | Consent footer content. |
| `VITE_STATELESS_PROVIDER` | injected by `vite.config.ts` | client | Derived from server-side `STATELESS_PROVIDER` for UI labeling. This should not usually be hand-set. |

## Recording And Comparative Capture

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `RECORDING_EXPORT_SERVER_ENABLED` | `false` | dev middleware | Enables local recording export endpoint. |
| `RECORDING_EXPORT_DIR` | `.agent/recordings` | dev middleware | Destination directory for exported recordings. |
| `COMPARATIVE_RECORDING_ENABLED` | `false` | comparative recorder | Enables `/api/recording/comparative`. |
| `COMPARATIVE_RECORDING_MODEL` | Engram/model fallback chain | comparative recorder | Model used for comparative recording if the script does not specify one. |
| `COMPARATIVE_RECORDING_RESTORE_MEASUREMENT` | `explicit-restore` | comparative recorder | `explicit-restore` actively times restore; `provider-metadata` trusts provider metadata. |

## Why `.env.local` Is Sparse

The local file only needs values that differ from defaults or provide secrets.
For this repo today, those are mostly provider keys, provider base URLs, model
selection, and a few dev UI toggles. Capacity limits, schedule windows, invite
codes, OVH provisioning, and recording controls can all be omitted until that
feature path is being tested.
