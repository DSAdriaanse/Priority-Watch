# Deploying on Debian

Layout on the server:

| Path | Contents |
|---|---|
| `/opt/priority-watch/pocketbase` | PocketBase binary (v0.36.x) |
| `/opt/priority-watch/pb_migrations`, `pb_hooks` | copied from `backend/` |
| `/opt/priority-watch/dist` | built front end (`web/dist`) |
| `/var/lib/priority-watch/pb_data` | the database and uploads (back this up) |
| `/etc/priority-watch/env` | secrets, mode 600 (see `.env.example`) |

## Scripted install on the server (recommended)

Prerequisites: a Debian server you can ssh into as root, and DNS for `priority.apps.swcrs.org` already pointing at it (the certificate needs it). The pull requests must be merged to `main` (or pass `--branch`).

```bash
scp deploy/bootstrap.sh root@your-server:
ssh root@your-server
bash bootstrap.sh --domain priority.apps.swcrs.org --email you@example.org --superuser-email you@example.org
```

The script asks which local port the app should listen on and suggests the first free one from 8090 up. Press Enter to accept it, or pass `--port 8091` to skip the question. It refuses a port that is not a number from 1024 to 65535 or that something else is already using. The port is only used between Nginx and the app on the same machine, so it is not opened in the firewall and nothing outside the server can reach it directly.

The script installs Node 22, then shows a public key and waits while you add it to the repo (GitHub, Settings, Deploy keys, leave write access unchecked). It then clones the repo, builds it, and sets up PocketBase, systemd, Nginx with TLS, the firewall and hourly backups.
It prints the PocketBase superuser login and a generated webhook secret once. Save them.

Update later, from the server:

```bash
priority-watch-update                  # pull, build, back up, restart, health check, roll back if unhealthy
priority-watch-update --branch main    # switch branch
```

A tiny server (under 2 GB RAM) may struggle with the front-end build. Add a swap file before running an update.

Everything is installed under:

| Path | Contents |
|---|---|
| `/opt/priority-watch` | `pocketbase` binary, `pb_hooks`, `pb_migrations`, `dist`, `backup.sh` (previous release kept in `.prev`) |
| `/opt/priority-watch-src` | git clone that `priority-watch-update` pulls from |
| `/var/lib/priority-watch/pb_data` | the database and uploads (back this up) |
| `/etc/priority-watch/env` | secrets, mode 640 (see `.env.example`); edit, then `systemctl restart priority-watch` |

The setup step is safe to re-run (for example after fixing DNS if certbot failed). It does not touch your env file or data.
It does not change SSH settings, so disable password and root login yourself once key login works.

### The port

The chosen port is saved as `PW_PORT` in `/etc/priority-watch/env`. The systemd unit reads it from there, and setup writes it into the Nginx site. To change it later, re-run setup with the new port (it keeps your secrets and data):

```bash
priority-watch-update --setup --domain priority.apps.swcrs.org --email you@example.org --port 8095
```

Do not just edit `PW_PORT` by hand; Nginx would still point at the old port. Servers installed before this option existed keep running on 8090, and the next update records that in the env file.

A different port is not enough on its own to run a second copy on the same server. The service name, install folders, data folder, Nginx site, service user and backup job are all shared at the moment, so a second install would overwrite the first. Making those configurable per instance is a separate change.

## Manual install (what the script does)

```bash
sudo apt install nginx certbot python3-certbot-nginx sqlite3 unzip
sudo useradd --system --home /var/lib/priority-watch --shell /usr/sbin/nologin pwatch
sudo install -d -o pwatch -g pwatch /var/lib/priority-watch /opt/priority-watch /var/backups/priority-watch
sudo install -d -m 750 -g pwatch /etc/priority-watch

# PocketBase binary: download the linux_amd64 zip from github.com/pocketbase/pocketbase/releases
sudo unzip pocketbase_*_linux_amd64.zip pocketbase -d /opt/priority-watch

# Code (build on your workstation or the server: cd web && npm ci && npm run build)
sudo rsync -a backend/pb_migrations backend/pb_hooks /opt/priority-watch/
sudo rsync -a --delete web/dist/ /opt/priority-watch/dist/
sudo install -m 755 deploy/backup.sh /opt/priority-watch/backup.sh

sudo cp .env.example /etc/priority-watch/env   # then edit it, fill in the secrets (setup also generates INBOUND_WEBHOOK_SECRET)
sudo chmod 640 /etc/priority-watch/env; sudo chown root:pwatch /etc/priority-watch/env

sudo cp deploy/priority-watch.service /etc/systemd/system/   # reads PW_PORT from the env file (set it, for example PW_PORT=8090)
sudo sed 's/__DOMAIN__/priority.apps.swcrs.org/; s/__PORT__/8090/' deploy/nginx.conf | sudo tee /etc/nginx/sites-available/priority-watch >/dev/null
sudo ln -s /etc/nginx/sites-available/priority-watch /etc/nginx/sites-enabled/
sudo certbot --nginx -d priority.apps.swcrs.org     # gets the certificate (edit server_name first if needed)
sudo systemctl daemon-reload && sudo systemctl enable --now priority-watch
sudo nginx -t && sudo systemctl reload nginx
```

Create the PocketBase superuser (the database admin, separate from app users):

```bash
sudo -u pwatch /opt/priority-watch/pocketbase superuser upsert you@example.org 'a-long-password' \
  --dir /var/lib/priority-watch/pb_data --migrationsDir /opt/priority-watch/pb_migrations
```

The admin UI is at `/_/`. Restrict it by IP in `nginx.conf` if you like.

## Load your data

Either import the Base44 export:

```bash
export PB_URL=https://priority.apps.swcrs.org PB_SUPERUSER_EMAIL=you@example.org PB_SUPERUSER_PASSWORD=...
node scripts/import-base44.mjs ./base44-export --dry-run     # check the counts and notes
node scripts/import-base44.mjs ./base44-export --send-resets # real run; emails volunteers a password-setup link
```

Passwords cannot be migrated; everyone sets a new one from the emailed link. To restore the original
timestamps, stop the service, run the `sqlite3 ... < restore-dates.sql` line the importer prints, start it again.

Or start empty: `node scripts/create-admin.mjs you@example.org "Your Name" W1ABC`.

Then set the non-secret integration settings in the app under **Settings**.

## Point the repeater system at it

Keep the old path working: `POST https://priority.apps.swcrs.org/api/functions/handleInboundWebhook`
or use the new one, `POST /api/pw/webhook/inbound`. Send the secret in the `X-Webhook-Secret` header (or a `secret` field in the JSON body), never in the URL. The legacy GET form is gone.

```bash
curl -X POST https://priority.apps.swcrs.org/api/pw/webhook/inbound \
  -H "X-Webhook-Secret: $INBOUND_WEBHOOK_SECRET" -H 'content-type: application/json' \
  -d '{"node_number":"408","alert_type":"Priority Traffic","nature":"test"}'
```

Rotate the old secret: the Base44 export contains it in clear text.

## Backups

`deploy/backup.sh` takes a consistent SQLite backup and prunes after 14 days. Schedule it:

```
0 * * * *  pwatch  /opt/priority-watch/backup.sh
```

Copy `/var/backups/priority-watch` off the machine too (rsync, rclone, restic). Restore: stop the service, unpack the tarball into `pb_data`, start.

## Upgrades

App: run `priority-watch-update` on the server. Rolling back restores the previous code only; migrations that already ran are not undone, so restore a backup if the schema changed.
PocketBase itself: back up, then re-run `setup` with `PB_VERSION=x.y.z` set in the server environment (or replace the binary by hand), and restart. Read the release notes first; it is pre-1.0.

## Troubleshooting

- App will not start after choosing a port: another program may be using it (`ss -ltnp | grep :PORT`). Re-run setup with a free `--port`.
- Dashboard does not update live: Nginx is buffering `/api/realtime`. Use the supplied config.
- Alerts arrive but no SMS: check Settings status badges (Textbelt key present?) and `journalctl -u priority-watch`.
- 429 from the webhook: more than `WEBHOOK_RATE_LIMIT` requests/minute from one IP.
