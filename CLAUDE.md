# Claude Notes

## Deployment Workflow

- Dokploy uses Railpack for this app. `railpack.json` starts the production Node server with `npm run start` after `npm run build` builds the Vite client and server bundle.
- The canonical production URL is `https://demo.clarit.ai/`.
- GitHub PRs labeled `preview` automatically provision a temporary preview deployment subdomain. Add that label when opening a PR meant to exercise preview deployment.
- The main `demo.clarit.ai` deployment can be updated manually in Dokploy, or by tagging a GitHub release when release-triggered deployment is desired.