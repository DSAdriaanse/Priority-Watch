# Priority Watch

Emergency and priority traffic coordination for a GMRS repeater network. Your repeater system posts an alert to a webhook, operators triage and track the incident in real time, and volunteers are notified by SMS, email and Slack. When it is over, the incident is closed with an AI-written summary and an optional WordPress post.

Built for the SWCRS repeater network. It runs on one small Debian server that you own.

## What you need

- A Debian or Ubuntu server you can reach over SSH as root. 2 GB of RAM or more (the front-end build needs it; add a swap file on a smaller machine).
- A hostname pointing at the server, for example `priority.example.org`, if you want Nginx and a free TLS certificate installed for you. If you already run a reverse proxy elsewhere, you can skip this (see "Several servers" in the deployment guide).
- Read access to this repository from the server. The installer generates a read-only deploy key and shows it to you to paste into GitHub (Settings, Deploy keys, leave "Allow write access" unchecked). If you run your own copy of the repo, pass `--repo`.
- Optional, and all can be added later: a Textbelt key for SMS, SMTP details for email, a Slack bot token, an Allmon3 login for DTMF control, a WordPress application password, an Anthropic API key for AI summaries.

## Install

On your own computer, copy the installer to the server and run it:

```bash
scp deploy/bootstrap.sh root@your-server:
ssh root@your-server
bash bootstrap.sh
```

It asks a few questions (hostname, whether Nginx runs here or on another machine, a port, a contact email for the certificate, the git branch), shows you a plan, and waits for a yes before changing anything. When it finishes you have PocketBase, the app, systemd, Nginx with TLS, a firewall and hourly backups.

At the end it prints, once:
- the PocketBase admin login (the database admin, separate from app users),
- the webhook secret your repeater system must send.

Save both. Then:

1. Create the first app admin, from any computer with Node 22:
   ```bash
   PB_URL=https://priority.example.org PB_SUPERUSER_EMAIL=you@example.org PB_SUPERUSER_PASSWORD='...' \
     node scripts/create-admin.mjs you@example.org "Your Name" W1ABC
   ```
2. Sign in at your hostname, open **Settings**, and fill in the non-secret integration settings (Slack channel, WordPress URL, Allmon3 URL and so on).
3. Put the secrets in `/etc/priority-watch/env` on the server (Textbelt, SMTP, Slack, and the rest are listed in `.env.example`), then run `systemctl restart priority-watch`. The Settings page shows which ones the server can see.
4. Add your repeaters and guidance scripts in the app.
5. Point the repeater system at the webhook (see below).

Running it without questions (for scripts), or with a different port or name, is covered in [docs/deployment.md](docs/deployment.md).

## Send it an alert

```bash
curl -X POST https://priority.example.org/api/pw/webhook/inbound \
  -H "X-Webhook-Secret: YOUR_SECRET" -H 'content-type: application/json' \
  -d '{"node_number":"408","alert_type":"Priority Traffic","nature":"test"}'
```

The secret goes in the header, never in the URL. A new incident appears on every open dashboard live, without a page reload. All custom endpoints are listed in [docs/endpoints.md](docs/endpoints.md).

## Update

On the server:

```bash
cd / && priority-watch-update
```

It pulls the branch, builds, takes a backup, restarts, checks health, and rolls the code back by itself if the new version does not come up. Database changes that already ran are not undone, so restore a backup if a schema change goes wrong. To follow a different branch: `priority-watch-update --branch dev`.

## Good to know

- **One server, one database.** Data lives in a single SQLite file under `/var/lib/priority-watch/pb_data`. That is simple and fast, but it means one app server (you cannot load balance it).
- **Backups run hourly** into `/var/backups/priority-watch` and are kept 14 days. Copy that folder off the machine regularly (rsync, rclone, restic). A backup on the same disk is not a backup.
- **Roles:** `admin` can do everything, `operator` handles incidents, repeater control and DTMF, `priority_watch` is a read-only member. The server enforces this; hiding a button is not security.
- **Test servers send real messages** if you give them real SMS, email or Slack credentials. Leave those blank on a development copy.
- **Harden SSH** once your key login works (no password login, no root login). The installer does not touch your SSH settings.
- **Several apps on one server** are supported with `--name` (each gets its own service, folders, data, port and update command). See the deployment guide.
- **Moving from Base44?** `scripts/import-base44.mjs` loads the CSV export. Passwords cannot be moved, so everyone gets a password-setup email.

## More

| If you want to | Read |
|---|---|
| Install in detail, use an external proxy, run a second copy, restore a backup, troubleshoot | [docs/deployment.md](docs/deployment.md) |
| Understand or change the code | [docs/code-map.md](docs/code-map.md) |
| See the custom API routes | [docs/endpoints.md](docs/endpoints.md) |

## Developing

PocketBase on port 8090 with the hooks and migrations loaded, and the Vite dev server in front of it:

```bash
pocketbase serve --migrationsDir backend/pb_migrations --hooksDir backend/pb_hooks
cd web && npm install && npm run dev        # Vite proxies /api to PocketBase
```

Checks that CI runs on every pull request: `npm run lint`, `npm run typecheck` and `npm run build` in `web/`, `bash deploy/test/install.test.sh`, and `node --test backend/test/api.test.mjs` against a running PocketBase (see `backend/test/README.md`). Work happens on short-lived branches that go into `dev` by pull request; `main` is what production runs.

Stack: PocketBase (one Go binary, SQLite) with JS hooks, React, Vite, Tailwind, shadcn/ui and TypeScript, behind Nginx on Debian.

## License

GPL-3.0. See [LICENSE](LICENSE).
