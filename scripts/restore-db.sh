#!/usr/bin/env bash
# Restore a backup produced by scripts/backup-db.sh.
# Usage: scripts/restore-db.sh <backup-dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IN="${1:?usage: restore-db.sh <backup-dir>}"
set -a; . "$ROOT/backend/.env"; set +a

ARCHIVE="$(ls "$IN"/*.archive.gz | head -1)"
SRC_DB="$(basename "$ARCHIVE" .archive.gz)"

mongorestore --uri "$MONGO_URL" --gzip --archive="$ARCHIVE" --drop \
  --nsFrom "$SRC_DB.*" --nsTo "$DB_NAME.*"

[ -f "$IN/uploads.tar.gz" ] && tar -xzf "$IN/uploads.tar.gz" -C "$ROOT/backend"

echo "restored $SRC_DB -> $DB_NAME from $IN"
