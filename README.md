# Clarit.ai Demo Chat

Interactive demo chat application for comparing what the agent sends to the
model with what the human sees in the chat surface. The frontend is React,
TypeScript, Tailwind, and Vite. The local backend is mounted through Vite
middleware and handles provider routing, session admission, vouchers, recording,
and schedule/provisioning support.

## Local Development

```bash
npm install
npm run dev
```

The app defaults to `http://127.0.0.1:5173/` when Vite uses its standard port.

## Configuration

Copy `.env.example` to `.env.local` and set only the values needed for the
provider or feature path being tested. The local file is expected to be sparse:
most settings have code defaults or are only needed for specific optional
systems.

Common local provider settings:

- `STATELESS_PROVIDER=nvidia`
- `NVIDIA_NIM_API_KEY=...`
- `NVIDIA_NIM_MODEL=...`
- `OPENROUTER_API_KEY=...`
- `DEFAULT_STATELESS_MODEL=...`
- `VITE_DEFAULT_MODEL=...`

Full references:

- [Backend systems](docs/backend-systems.md)
- [Environment variables](docs/env.md)
- [Dev mode](docs/dev-mode.md)

## Scripts

```bash
npm run dev      # start Vite dev server
npm run lint     # run ESLint
npm run build    # type-check and build
npm run preview  # preview built output
```

## Notes

The current provider routing is configuration-selected. `STATELESS_PROVIDER`
chooses NVIDIA NIM or OpenRouter-compatible behavior, but the chat stream does
not automatically retry another provider after a runtime provider failure.
