#!/usr/bin/env bash
# Tests for the port handling in deploy/bootstrap.sh and deploy/server.sh.
# They load the functions without installing anything:  bash deploy/test/port.test.sh
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP=$(mktemp -d); LISTEN_PIDS=()
cleanup() { for p in "${LISTEN_PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; rm -rf "$TMP"; }
trap cleanup EXIT
FAILS=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (expected '$3', got '$2')"; FAILS=$((FAILS + 1)); fi; }
ok()   { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi; }

listen() { python3 -c "import socket,time,sys; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',$1)); s.listen(); time.sleep(120)" & LISTEN_PIDS+=($!); sleep 0.4; }

# Pick a block of free ports so the tests do not depend on what is running here.
BASE=18090; while (exec 3<>/dev/tcp/127.0.0.1/$BASE) 2>/dev/null || (exec 3<>/dev/tcp/127.0.0.1/$((BASE+1))) 2>/dev/null || (exec 3<>/dev/tcp/127.0.0.1/$((BASE+2))) 2>/dev/null; do BASE=$((BASE+10)); done

# bootstrap's defaults start at 8090; these tests shift that start by overriding the function inputs
boot() { ( export ENV_FILE="$TMP/env" BOOTSTRAP_SOURCE_ONLY=1; source "$HERE/bootstrap.sh"; "$@" ); }

echo "--- validation"
for v in 1024 8090 65535; do ok "valid_port accepts $v" "boot valid_port $v"; done
for v in 0 80 1023 65536 abc '' 80.5 -1; do ok "valid_port rejects '$v'" "! boot valid_port '$v'"; done

echo "--- suggestion (bootstrap.sh)"
rm -f "$TMP/env"
check "no env file, 8090 free or taken: a number is suggested" "$(boot suggest_port | grep -c -E '^[0-9]+$')" "1"
echo "PW_PORT=8123" > "$TMP/env"
check "existing install keeps its own port" "$(boot suggest_port)" "8123"
rm -f "$TMP/env"
# Move the search window to a known-free block by temporarily defining the start via a wrapper
suggest_from() { ( export ENV_FILE="$TMP/env" BOOTSTRAP_SOURCE_ONLY=1; source "$HERE/bootstrap.sh"
  suggest_port() { local p=$1; while port_in_use "$p"; do p=$((p + 1)); done; echo "$p"; }; suggest_port "$1" ); }
check "free start port is suggested as is" "$(suggest_from $BASE)" "$BASE"
listen $BASE
check "taken port is skipped" "$(suggest_from $BASE)" "$((BASE+1))"
listen $((BASE+1))
check "two taken ports are skipped" "$(suggest_from $BASE)" "$((BASE+2))"
ok "port_in_use sees the listener" "boot port_in_use $BASE"
ok "port_in_use is false for a free port" "! boot port_in_use $((BASE+5))"

# The real suggest_port starts at 8090. Compare it with an independent search so this holds whatever is running here.
first_free=8090; while (exec 3<>/dev/tcp/127.0.0.1/$first_free) 2>/dev/null; do first_free=$((first_free + 1)); done
rm -f "$TMP/env"
check "real suggest_port returns the first free port from 8090" "$(boot suggest_port)" "$first_free"

echo "--- bootstrap.sh refuses a bad port before changing anything"
if [ "$(id -u)" = 0 ] && [ -r /etc/debian_version ]; then
  out=$(cd "$TMP" && timeout 20 bash "$HERE/bootstrap.sh" --domain d.example --email e@example.org --port abc </dev/null 2>&1); rc=$?
  check "bootstrap with --port abc exits 1" "$rc" "1"
  ok "bootstrap with --port abc explains why" "echo \"$out\" | grep -q 'not a valid port'"
  out=$(cd "$TMP" && timeout 20 bash "$HERE/bootstrap.sh" --domain d.example --email e@example.org --port $BASE </dev/null 2>&1); rc=$?
  check "bootstrap with a port in use exits 1" "$rc" "1"
  ok "bootstrap names the port in use" "echo \"$out\" | grep -q 'already in use'"
else
  echo "SKIP bootstrap end-to-end refusal (needs root on Debian)"
fi

echo "--- choose_port without a terminal"
choose() { ( export ENV_FILE="$TMP/env" BOOTSTRAP_SOURCE_ONLY=1; source "$HERE/bootstrap.sh"; PORT=$1; choose_port </dev/null; echo "$PORT" ) 2>"$TMP/err"; }
check "valid --port is used" "$(choose $((BASE+7)) | tail -1)" "$((BASE+7))"
choose "abc" >/dev/null; check "invalid --port is refused" "$?" "1"
ok "invalid --port says why" "grep -q 'not a valid port' $TMP/err"
choose $BASE >/dev/null; check "port already in use is refused" "$?" "1"
ok "in-use message names the port" "grep -q 'Port $BASE is already in use' $TMP/err"
echo "PW_PORT=$BASE" > "$TMP/env"
check "re-running on the same port is allowed (it is our own)" "$(choose $BASE | tail -1)" "$BASE"
rm -f "$TMP/env"

echo "--- choose_port at a terminal"
pty() {  # pty "<keystrokes>" -> prints what the function ended up with
  python3 - "$1" "$HERE" "$TMP" <<'PY'
import os, pty, sys, time, select
keys, here, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
cmd = ["bash", "-c", f'export ENV_FILE={tmp}/env BOOTSTRAP_SOURCE_ONLY=1; source {here}/bootstrap.sh; choose_port; echo "RESULT=$PORT"']
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
out = b""
sent = 0
lines = keys.split("|")
deadline = time.time() + 15
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.3)
    if r:
        try: d = os.read(fd, 4096)
        except OSError: break
        if not d: break
        out += d
        if out.count(b"]: ") > sent and sent < len(lines):
            os.write(fd, (lines[sent] + "\n").encode()); sent += 1
    else:
        if os.waitpid(pid, os.WNOHANG)[0]: break
text = out.decode(errors="replace")
res = [l for l in text.splitlines() if l.startswith("RESULT=")]
print(res[-1] if res else "NORESULT")
print("PROMPTS=%d" % text.count("]: "))
if "not a valid port" in text: print("SAW_INVALID")
if "already in use" in text: print("SAW_INUSE")
PY
}
rm -f "$TMP/env"
r=$(pty "$((BASE+8))"); check "typed port is accepted" "$(echo "$r" | head -1)" "RESULT=$((BASE+8))"
r=$(pty ""); ok "empty answer takes the suggestion" "echo '$r' | head -1 | grep -qE '^RESULT=[0-9]+$'"
r=$(pty "70000|$((BASE+9))"); check "bad port re-asks, then accepts" "$(echo "$r" | head -1)" "RESULT=$((BASE+9))"
ok "bad port showed the reason and asked twice" "echo '$r' | grep -q SAW_INVALID && echo '$r' | grep -q PROMPTS=2"
r=$(pty "$BASE|$((BASE+6))"); check "port in use re-asks, then accepts" "$(echo "$r" | head -1)" "RESULT=$((BASE+6))"
ok "in-use port showed the reason" "echo '$r' | grep -q SAW_INUSE"

echo "--- server.sh"
srv() { ( export ENV_FILE="$TMP/senv" SERVER_SH_SOURCE_ONLY=1; source "$HERE/server.sh"; "$@" ); }
rm -f "$TMP/senv"
check "no env file: no port recorded" "$(srv current_port)" ""
printf 'APP_URL=https://x\nPW_PORT=8100\n' > "$TMP/senv"
check "current_port reads the env file" "$(srv current_port)" "8100"
srv set_env_value PW_PORT 8200; check "set_env_value replaces the line" "$(grep -c '^PW_PORT=' "$TMP/senv"):$(srv current_port)" "1:8200"
printf 'APP_URL=https://x\n' > "$TMP/senv"
srv set_env_value PW_PORT 8300; check "set_env_value adds the line when missing" "$(srv current_port)" "8300"
check "set_env_value keeps other lines" "$(grep -c '^APP_URL=' "$TMP/senv")" "1"
printf 'APP_URL=https://x\n' > "$TMP/senv"
srv ensure_port_setting; check "older install without PW_PORT gets 8090 (what it already runs on)" "$(srv current_port)" "8090"
printf 'PW_PORT=8111\n' > "$TMP/senv"
srv ensure_port_setting; check "ensure_port_setting leaves an existing port alone" "$(srv current_port)" "8111"
check "health check follows PW_PORT" "$( ( export ENV_FILE="$TMP/senv" SERVER_SH_SOURCE_ONLY=1; source "$HERE/server.sh"; resolve_health_url; echo "$HEALTH_URL" ) )" "http://127.0.0.1:8111/api/health"
check "HEALTH_URL override still wins" "$( ( export HEALTH_URL=http://h/x ENV_FILE="$TMP/senv" SERVER_SH_SOURCE_ONLY=1; source "$HERE/server.sh"; resolve_health_url; echo "$HEALTH_URL" ) )" "http://h/x"
ok "server valid_port rejects 80" "! srv valid_port 80"

echo "--- generated config"
sed -e "s|__DOMAIN__|priority.example.org|g" -e "s|__PORT__|8123|g" "$HERE/nginx.conf" > "$TMP/site.conf"
check "nginx: no placeholders left" "$(grep -c '__' "$TMP/site.conf")" "0"
check "nginx: every proxy_pass uses the chosen port" "$(grep -c 'proxy_pass http://127.0.0.1:8123;' "$TMP/site.conf")" "3"
check "nginx: old fixed port is gone" "$(grep -c '8090' "$TMP/site.conf")" "0"
ok "systemd unit reads the port from the env file" "grep -q -- '--http 127.0.0.1:\${PW_PORT}' '$HERE/priority-watch.service'"
ok "systemd unit loads that env file" "grep -q '^EnvironmentFile=/etc/priority-watch/env' '$HERE/priority-watch.service'"
ok ".env.example documents PW_PORT" "grep -q '^PW_PORT=8090' '$HERE/../.env.example'"

echo
[ "$FAILS" = 0 ] && echo "ALL PASSED" || echo "$FAILS FAILED"
exit $((FAILS > 0))
