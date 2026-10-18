#!/usr/bin/env bash
# Runs ON THE SERVER. Started by priority-watch-update (deploy/update.sh), which stages the files first.
#
#   server.sh setup --domain priority.example.org --email you@example.org [--superuser-email you@example.org]
#       One-time (and safe to re-run) server preparation + first release.
#   server.sh release
#       Install the code staged next to this script, restart, health check, roll back on failure.
#
# Layout: code in /opt/priority-watch, data in /var/lib/priority-watch, secrets in /etc/priority-watch/env.
set -euo pipefail
# su (without -) and some ssh setups omit the sbin folders that useradd, ufw, nginx, sshd and runuser live in.
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"

APP=${APP:-/opt/priority-watch}
DATA=${DATA:-/var/lib/priority-watch}
ENV_FILE=${ENV_FILE:-/etc/priority-watch/env}
SVC_USER=pwatch
PB_VERSION=${PB_VERSION:-0.36.0}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8090/api/health}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-30}
STAGE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)   # parent of deploy/

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_root() { [ "$(id -u)" = 0 ] || exec sudo -E bash "${BASH_SOURCE[0]}" "$@"; }

install_packages() {
  say "Installing packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nginx certbot python3-certbot-nginx sqlite3 unzip curl ca-certificates \
    ufw fail2ban unattended-upgrades cron >/dev/null
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
}

create_user_and_dirs() {
  say "Creating service user and directories"
  id "$SVC_USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$SVC_USER"
  install -d -o "$SVC_USER" -g "$SVC_USER" -m 750 "$DATA" "$DATA/pb_data" /var/backups/priority-watch
  install -d -m 755 "$APP"
  install -d -m 750 -g "$SVC_USER" "$(dirname "$ENV_FILE")"
}

install_pocketbase() {
  if [ -x "$APP/pocketbase" ] && "$APP/pocketbase" --version 2>/dev/null | grep -q " $PB_VERSION\$"; then
    say "PocketBase $PB_VERSION already installed"; return
  fi
  say "Installing PocketBase $PB_VERSION"
  local arch; arch=$(dpkg --print-architecture)
  case "$arch" in amd64|arm64) ;; armhf) arch=armv7 ;; *) die "unsupported architecture: $arch" ;; esac
  local zip="pocketbase_${PB_VERSION}_linux_${arch}.zip"
  local base="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"
  local tmp; tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/$zip" "$base/$zip"
  curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
  (cd "$tmp" && grep " $zip\$" checksums.txt | sha256sum -c -) || die "PocketBase checksum mismatch"
  unzip -q -o "$tmp/$zip" pocketbase -d "$tmp"
  install -m 755 -o root -g root "$tmp/pocketbase" "$APP/pocketbase"
  rm -rf "$tmp"
}

write_env_file() {
  if [ -f "$ENV_FILE" ]; then say "Keeping existing $ENV_FILE"; return; fi
  say "Creating $ENV_FILE"
  cp "$STAGE/.env.example" "$ENV_FILE"
  sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" "$ENV_FILE"
  local secret; secret=$(openssl rand -hex 32)
  sed -i "s|^INBOUND_WEBHOOK_SECRET=.*|INBOUND_WEBHOOK_SECRET=$secret|" "$ENV_FILE"
  chown root:"$SVC_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
  NEW_SECRET=$secret
}

install_service() {
  say "Installing systemd service"
  install -m 644 "$STAGE/deploy/priority-watch.service" /etc/systemd/system/priority-watch.service
  systemctl daemon-reload
  systemctl enable priority-watch >/dev/null
}

install_nginx() {
  say "Configuring Nginx for $DOMAIN"
  sed "s|__DOMAIN__|$DOMAIN|g" "$STAGE/deploy/nginx.conf" > /etc/nginx/sites-available/priority-watch
  ln -sf /etc/nginx/sites-available/priority-watch /etc/nginx/sites-enabled/priority-watch
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  say "Requesting a TLS certificate (DNS for $DOMAIN must already point at this server)"
  if certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email -n --redirect; then
    TLS=yes
  else
    TLS=no
    warn "certbot failed. The site works over plain HTTP for now. Fix DNS, then re-run:  server.sh setup --domain $DOMAIN --email $EMAIL"
  fi
}

configure_firewall() {
  say "Configuring firewall"
  local ssh_port; ssh_port=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}'); ssh_port=${ssh_port:-22}
  ufw allow "$ssh_port"/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  systemctl enable --now fail2ban >/dev/null 2>&1 || true
}

install_backup() {
  install -m 755 "$STAGE/deploy/backup.sh" "$APP/backup.sh"
  cat > /etc/cron.d/priority-watch <<CRON
# Hourly consistent backup of the PocketBase database (kept 14 days). Output goes to the journal.
0 * * * * $SVC_USER $APP/backup.sh 2>&1 | logger -t priority-watch-backup
CRON
  chmod 644 /etc/cron.d/priority-watch
}

healthy() {
  local i; for ((i = 0; i < HEALTH_TIMEOUT; i++)); do
    curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

do_release() {
  say "Releasing"
  [ -x "$APP/pocketbase" ] || die "PocketBase is not installed. Run:  server.sh setup ..."
  for d in dist pb_hooks pb_migrations; do [ -d "$STAGE/$d" ] || die "missing $STAGE/$d in the staged release"; done

  [ -x "$APP/backup.sh" ] && runuser -u "$SVC_USER" -- "$APP/backup.sh" || warn "skipping pre-release backup"

  rm -rf "$APP/.prev"; mkdir -p "$APP/.prev"
  for d in dist pb_hooks pb_migrations; do
    [ -d "$APP/$d" ] && mv "$APP/$d" "$APP/.prev/$d"
    cp -a "$STAGE/$d" "$APP/$d"
  done
  chown -R root:root "$APP/dist" "$APP/pb_hooks" "$APP/pb_migrations"

  systemctl restart priority-watch
  if healthy; then
    say "Release is up ($(date -u +%FT%TZ))"
    return 0
  fi

  warn "New release did not become healthy. Rolling back."
  journalctl -u priority-watch -n 30 --no-pager || true
  for d in dist pb_hooks pb_migrations; do
    if [ -d "$APP/.prev/$d" ]; then rm -rf "${APP:?}/$d"; mv "$APP/.prev/$d" "$APP/$d"; fi
  done
  systemctl restart priority-watch
  healthy && warn "Rolled back to the previous code. Database migrations that already ran were NOT undone; restore a backup if the schema changed." || warn "Still unhealthy after rollback. Check: journalctl -u priority-watch"
  return 1
}

create_superuser() {
  [ -n "${SUPERUSER_EMAIL:-}" ] || return 0
  say "Creating PocketBase superuser $SUPERUSER_EMAIL"
  local pw; pw=$(openssl rand -base64 18 | tr -d '/+=')
  runuser -u "$SVC_USER" -- "$APP/pocketbase" superuser upsert "$SUPERUSER_EMAIL" "$pw" \
    --dir "$DATA/pb_data" --migrationsDir "$APP/pb_migrations" >/dev/null
  SUPERUSER_PW=$pw
}

cmd_setup() {
  DOMAIN=; EMAIL=; SUPERUSER_EMAIL=; NEW_SECRET=; SUPERUSER_PW=; TLS=no
  while [ $# -gt 0 ]; do
    case "$1" in
      --domain) DOMAIN=$2; shift 2 ;;
      --email) EMAIL=$2; shift 2 ;;
      --superuser-email) SUPERUSER_EMAIL=$2; shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done
  [ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "usage: server.sh setup --domain <host> --email <certbot email> [--superuser-email <email>]"
  [ -r /etc/debian_version ] || die "this script is for Debian/Ubuntu"

  install_packages
  create_user_and_dirs
  install_pocketbase
  write_env_file
  install_service
  install_backup
  do_release || die "first release failed"
  create_superuser
  install_nginx
  configure_firewall

  say "Done"
  echo "Site:            http$([ "$TLS" = yes ] && echo s)://$DOMAIN"
  echo "Admin UI:        http$([ "$TLS" = yes ] && echo s)://$DOMAIN/_/"
  [ -n "$SUPERUSER_PW" ] && echo "Superuser login: $SUPERUSER_EMAIL / $SUPERUSER_PW   (shown once; change it in the admin UI)"
  [ -n "$NEW_SECRET" ] && echo "Webhook secret:  $NEW_SECRET   (saved in $ENV_FILE; put this in the repeater system's X-Webhook-Secret header)"
  cat <<NEXT

Next:
  1. Edit $ENV_FILE (Textbelt, SMTP, Slack, Allmon3, WordPress, Anthropic), then:  systemctl restart priority-watch
  2. Create the first app admin (from your laptop):  PB_URL=https://$DOMAIN node scripts/create-admin.mjs you@example.org "Name" CALL
     or import Base44 data:  node scripts/import-base44.mjs <export-folder> --dry-run
  3. Harden SSH once your key login works: PasswordAuthentication no, PermitRootLogin no in /etc/ssh/sshd_config.d/
  4. Copy /var/backups/priority-watch off this machine regularly.
NEXT
}

main() {
  local cmd=${1:-}; shift || true
  case "$cmd" in
    setup)   need_root "$cmd" "$@"; cmd_setup "$@" ;;
    release) need_root "$cmd" "$@"; do_release ;;
    *) die "usage: server.sh {setup|release} ..." ;;
  esac
}

[ "${SERVER_SH_SOURCE_ONLY:-}" = 1 ] || main "$@"
