#!/usr/bin/env bash
# One-shot setup for a fresh Debian server. Copy this single file to the server and run it as root:
#
#   scp deploy/bootstrap.sh root@your-server:
#   ssh root@your-server
#   bash bootstrap.sh --domain priority.apps.swcrs.org --email you@example.org --superuser-email you@example.org [--port 8090]
#
# It asks which local port the app should listen on and suggests the first free one starting at 8090
# (so a second copy on the same server gets 8091, and so on). Pass --port to skip the question.
# The port is only used between Nginx and the app on this machine; it is not opened in the firewall.
#
# It installs Node, gets the code from your private GitHub repo using a read-only deploy key, builds it,
# and sets up PocketBase, systemd, Nginx + TLS, firewall and backups. Re-running is safe.
# Afterwards, update with:  priority-watch-update
set -euo pipefail
export PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin"

REPO=${REPO:-git@github.com:DSAdriaanse/Priority-Watch.git}
BRANCH=${BRANCH:-main}
SRC=${SRC:-/opt/priority-watch-src}
KEY=/root/.ssh/priority-watch-deploy
DOMAIN=; EMAIL=; SU_EMAIL=; PORT=
ENV_FILE=${ENV_FILE:-/etc/priority-watch/env}

# --- port selection
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]; }
existing_port() { [ -f "$ENV_FILE" ] && sed -n 's/^PW_PORT=//p' "$ENV_FILE" | head -1 || true; }

# Suggested default: the port this install already uses, else the first free port from 8090 up.
suggest_port() {
  local p; p=$(existing_port)
  if [ -n "$p" ]; then echo "$p"; return; fi
  p=8090
  while port_in_use "$p"; do p=$((p + 1)); done
  echo "$p"
}

# Fills PORT: from --port, or by asking (when run from a terminal), or with the suggestion.
choose_port() {
  local def current problem
  def=$(suggest_port); current=$(existing_port)
  while true; do
    if [ -z "$PORT" ]; then
      if [ -t 0 ]; then
        read -r -p "Local port for the app (Nginx forwards to it; not opened to the internet) [$def]: " PORT </dev/tty
        PORT=${PORT:-$def}
      else
        PORT=$def; echo "No terminal to ask on, using port $PORT"
      fi
    fi
    if ! valid_port "$PORT"; then
      problem="'$PORT' is not a valid port. Use a number from 1024 to 65535."
    elif [ "$PORT" != "$current" ] && port_in_use "$PORT"; then
      problem="Port $PORT is already in use on this server."
    else
      return 0
    fi
    echo "$problem" >&2
    [ -t 0 ] || exit 1
    PORT=
  done
}

# Lets tests load the functions above without running the installer.
[ "${BOOTSTRAP_SOURCE_ONLY:-}" = 1 ] && return 0


while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN=$2; shift 2 ;;
    --email) EMAIL=$2; shift 2 ;;
    --superuser-email) SU_EMAIL=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    --branch) BRANCH=$2; shift 2 ;;
    --repo) REPO=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
say() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run as root"
[ -r /etc/debian_version ] || die "this script is for Debian/Ubuntu"
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "usage: bash bootstrap.sh --domain <host> --email <certbot email> [--superuser-email <email>] [--port <n>] [--branch <name>]"

choose_port

say "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssh-client xz-utils openssl >/dev/null

ensure_node() {
  if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then
    say "Node $(node -v) already installed"; return
  fi
  say "Installing Node 22 (latest v22 from nodejs.org, checksum verified)"
  local arch; case "$(dpkg --print-architecture)" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) die "unsupported architecture" ;; esac
  local base=https://nodejs.org/dist/latest-v22.x tmp; tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt"
  local file; file=$(awk -v a="linux-$arch.tar.xz" '$2 ~ a"$" {print $2}' "$tmp/SHASUMS256.txt")
  [ -n "$file" ] || die "could not find a Node 22 build for $arch"
  curl -fsSL -o "$tmp/$file" "$base/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -) || die "Node checksum mismatch"
  rm -rf /opt/node && mkdir -p /opt/node
  tar -xJf "$tmp/$file" -C /opt/node --strip-components=1
  ln -sf /opt/node/bin/node /usr/local/bin/node
  ln -sf /opt/node/bin/npm /usr/local/bin/npm
  ln -sf /opt/node/bin/npx /usr/local/bin/npx
  rm -rf "$tmp"
  node -v
}
ensure_node

# --- repository access (private repo -> read-only deploy key)
if [[ "$REPO" == git@* ]]; then
  mkdir -p /root/.ssh; chmod 700 /root/.ssh
  if [ ! -f "$KEY" ]; then
    ssh-keygen -t ed25519 -N "" -C "priority-watch-server-$(hostname)" -f "$KEY" >/dev/null
  fi
  touch /root/.ssh/config; chmod 600 /root/.ssh/config
  if ! grep -q "priority-watch-deploy" /root/.ssh/config; then
    cat >> /root/.ssh/config <<CFG

Host github.com
  IdentityFile $KEY
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
CFG
  fi
  until git ls-remote "$REPO" >/dev/null 2>&1; do
    cat <<MSG

------------------------------------------------------------------
Give this server READ-ONLY access to the repo:
  GitHub -> Priority-Watch -> Settings -> Deploy keys -> Add deploy key
  Title: this server    Key (leave "Allow write access" UNCHECKED):

$(cat "$KEY.pub")
------------------------------------------------------------------
MSG
    read -r -p "Press Enter once the key is added (Ctrl-C to abort)... " _ </dev/tty
  done
fi

say "Getting the code ($BRANCH)"
if [ -d "$SRC/.git" ]; then git -C "$SRC" remote set-url origin "$REPO"; else git clone --quiet "$REPO" "$SRC"; fi
git -C "$SRC" fetch --quiet origin
git -C "$SRC" rev-parse --verify --quiet "origin/$BRANCH" >/dev/null || die "branch '$BRANCH' not found in the repo. Merge the pull requests, or pass --branch <name>."

git -C "$SRC" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
install -m 755 "$SRC/deploy/update.sh" /usr/local/bin/priority-watch-update
exec /usr/local/bin/priority-watch-update --branch "$BRANCH" --setup --domain "$DOMAIN" --email "$EMAIL" --port "$PORT" ${SU_EMAIL:+--superuser-email "$SU_EMAIL"}
