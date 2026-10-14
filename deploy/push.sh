#!/usr/bin/env bash
# Runs on YOUR machine from the repo checkout. Builds the front end, ships it to the server over ssh, and releases it.
#
#   First time:  deploy/push.sh you@server --setup --domain priority.example.org --email you@example.org [--superuser-email you@example.org]
#   After that:  deploy/push.sh you@server
#
# The login needs root or passwordless-capable sudo (you will be prompted for a sudo password if it needs one).
# Needs: ssh, tar, node + npm locally. Nothing but ssh is required on the server beforehand.
set -euo pipefail

HOST=${1:-}; [ -n "$HOST" ] || { sed -n '2,9p' "$0"; exit 2; }
shift
MODE=release; ARGS=()
if [ "${1:-}" = "--setup" ]; then MODE=setup; shift; ARGS=("$@"); fi

cd "$(dirname "$0")/.."
[ -d backend/pb_hooks ] && [ -d web ] || { echo "run this from the priority-watch repo" >&2; exit 1; }

echo "==> Building front end"
(cd web && npm ci --no-audit --no-fund && npm run build)

STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
cp -a web/dist "$STAGE/dist"
cp -a backend/pb_hooks backend/pb_migrations "$STAGE/"
mkdir "$STAGE/deploy"; cp deploy/server.sh deploy/backup.sh deploy/priority-watch.service deploy/nginx.conf "$STAGE/deploy/"
cp .env.example "$STAGE/.env.example"

echo "==> Uploading to $HOST"
tar -C "$STAGE" -cz . | ssh "$HOST" 'rm -rf ~/pw-release && mkdir ~/pw-release && tar -xz -C ~/pw-release'

echo "==> Running $MODE on the server"
# -t so sudo can ask for a password
ssh -t "$HOST" "bash ~/pw-release/deploy/server.sh $MODE $(printf '%q ' "${ARGS[@]+"${ARGS[@]}"}")"
