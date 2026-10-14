#!/usr/bin/env bash
# Consistent online backup of the PocketBase SQLite files. Run from cron/systemd timer as pwatch.
#   0 * * * *  /opt/priority-watch/backup.sh
set -euo pipefail
DATA=${DATA:-/var/lib/priority-watch/pb_data}
OUT=${OUT:-/var/backups/priority-watch}
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$OUT"
stamp=$(date +%Y%m%d-%H%M%S)
tmp=$(mktemp -d "$OUT/.tmp.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
for db in data.db auxiliary.db; do
  [ -f "$DATA/$db" ] && sqlite3 "$DATA/$db" ".backup '$tmp/$db'"
done
[ -d "$DATA/storage" ] && cp -a "$DATA/storage" "$tmp/storage"
tar -C "$tmp" -czf "$OUT/pb-$stamp.tar.gz" .
chmod 600 "$OUT/pb-$stamp.tar.gz"
find "$OUT" -name 'pb-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup written: $OUT/pb-$stamp.tar.gz"
