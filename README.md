# Priority Watch

Emergency traffic coordination for the SWCRS GMRS repeater network. Repeater systems post alerts to a webhook, operators triage and track incidents in real time, and volunteers are notified by SMS, email and Slack.

This repo is a rebuild of the app that previously ran on Base44, moved to a self-hosted Debian server so every layer is visible and owned.

## Stack

- **Backend:** PocketBase (single Go binary, SQLite inside) with JS hooks for custom routes
- **Frontend:** React, Vite, Tailwind, shadcn/ui, TanStack Query
- **Realtime:** PocketBase subscriptions (SSE) behind Nginx
- **Deploy:** systemd + Nginx + Let's Encrypt on Debian

## Layout

```
backend/    PocketBase migrations (schema and access rules) and hooks (webhook, notify, resolve, DTMF, link)
web/        React app. src/api is the only code that talks to the backend; src/features is organized by feature
deploy/     Nginx, systemd, backup scripts and install notes
scripts/    One-time Base44 data import and seed data
docs/       Data model, endpoint reference, runbook
legacy/     Read-only copy of the original Base44 code, kept as the porting reference
```

## Principles

1. One door to the backend: pages never call PocketBase directly.
2. Permissions are enforced on the server (collection rules plus a shared auth helper). Hiding buttons is convenience, not protection.
3. Secrets live in `.env`, never in the database or the browser.
4. Schema and rules are versioned migrations.
5. Real data and exports never go in git.

## Status

Feature-complete port of the Base44 app: schema and rules, API hooks (19 end-to-end tests in `backend/test`), the React front end, a browser smoke test (`web/e2e/smoke.mjs`), a Base44 CSV importer, and Debian deploy files.

- Install and run: `docs/deployment.md`
- Custom endpoints: `docs/endpoints.md`
- What changed from Base44 and why: `docs/porting-notes.md`
- Local development: PocketBase on `:8090` with `--migrationsDir backend/pb_migrations --hooksDir backend/pb_hooks`, then `cd web && npm install && npm run dev` (Vite proxies `/api` to it)
