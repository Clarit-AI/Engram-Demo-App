# Dev Mode

Dev mode is a mix of Vite behavior, browser-only debug affordances, and optional
local backend endpoints. It should be treated as a testing surface, not as the
source of truth for production availability.

## What Dev Mode Does

The current dev-mode behavior supports:

- local Vite middleware for chat, session, redemption, schedule, and recording
  endpoints
- session and rate-limit diagnostics when debug flags are enabled
- manual UI testing around availability and demo state
- optional recording export during local authoring
- optional comparative recording runs against Engram and stateless inference
- `window.__arc` exposure for local arc-store debugging in browser dev tools

## Debug Controls

| Variable | Effect |
| --- | --- |
| `VITE_SESSION_DEBUG=true` | Shows client-side debug UI such as session chips and developer menu surfaces. |
| `SESSION_DEBUG=true` | Adds a debug flag to `/api/session` responses. |
| `VITE_DEV_BYPASS_AVAILABILITY=true` | Lets the client bypass availability gating for local testing. |
| `VITE_ENABLE_RECORDING_EXPORT=true` | Shows the recording export control. |
| `RECORDING_EXPORT_SERVER_ENABLED=true` | Enables the local export endpoint that writes recording files. |
| `COMPARATIVE_RECORDING_ENABLED=true` | Enables comparative recording endpoint behavior. |

## Availability Testing

There are two separate concepts that can look similar in the UI:

- schedule availability: whether a live window is open, code-required, or
  offline
- provisioning state: whether an OVH instance is none, provisioning, running,
  terminating, or error

`VITE_DEV_BYPASS_AVAILABILITY` affects the browser UI only. It should not be
documented or treated as server-side availability.

## Still Relevant

These dev-mode features are still useful:

- session diagnostics, because rate limits and queueing are active backend
  behavior
- recording export, because replay fixtures are authored locally
- comparative recording, because it measures Engram against stateless inference
- availability bypass, because it makes UI states testable without changing the
  live schedule

## Possibly Superseded Or Needs Clarification

- Some UI availability states overlap with the server schedule and provisioning
  state. Docs and UI should make clear when a state is simulated for testing.
- Simulated Engram mode is now a formal fallback/demo mode. Any older dev-only
  wording around fake stateful behavior should be updated to call it
  `simulated-engram`.
- Provider failover should not be described as automatic until the chat stream
  path actually retries a secondary provider.
