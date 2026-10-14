# Deploying on Debian

Layout on the server:

| Path | Contents |
|---|---|
| `/opt/priority-watch/pocketbase` | PocketBase binary (v0.36.x) |
| `/opt/priority-watch/pb_migrations`, `pb_hooks` | copied from `backend/` |
| `/opt/priority-watch/dist` | built front end (`web/dist`) |
| `/var/lib/priority-watch/pb_data` | the database and uploads (back this up) |
| `/etc/priority-watch/env` | secrets, mode 600 (see `.env.example`) |

## First install

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

sudo cp .env.example /etc/priority-watch/env   # then edit it, fill in the secrets
sudo chmod 640 /etc/priority-watch/env; sudo chown root:pwatch /etc/priority-watch/env

sudo cp deploy/priority-watch.service /etc/systemd/system/
sudo cp deploy/nginx.conf /etc/nginx/sites-available/priority-watch
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

Back up, replace the `pocketbase` binary (`./pocketbase update` or download), copy new `pb_migrations`/`pb_hooks`/`dist`, `systemctl restart priority-watch`. Migrations run on start.

## Troubleshooting

- Dashboard does not update live: Nginx is buffering `/api/realtime`. Use the supplied config.
- Alerts arrive but no SMS: check Settings status badges (Textbelt key present?) and `journalctl -u priority-watch`.
- 429 from the webhook: more than `WEBHOOK_RATE_LIMIT` requests/minute from one IP.
