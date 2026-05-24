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
npm run build    # type-check, build the client, and bundle the Node server
npm run preview  # preview built client output only
npm run start    # run the production Node server from server-dist
```

## Deployment

The Dokploy deployment path uses Railpack with `railpack.json`. Railpack should
run `npm run build`, then start the container with `npm run start`. The production
server serves the Vite `dist` assets and mounts the same `/api/*` handlers used
in local development.

Set `PORT` in Dokploy if the platform does not inject one automatically. The
server binds to `0.0.0.0` by default for container traffic.

Launch metadata, social preview tags, and Google Analytics are configured in
`index.html`. The social preview and crawler files live in `public/`.

## Notes

The current provider routing is configuration-selected. `STATELESS_PROVIDER`
chooses NVIDIA NIM or OpenRouter-compatible behavior, but the chat stream does
not automatically retry another provider after a runtime provider failure.
