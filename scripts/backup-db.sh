#!/usr/bin/env bash
# Back up the AppCatalog database and the uploaded category icons.
# Usage: scripts/backup-db.sh [output-dir]   (reads MONGO_URL/DB_NAME from backend/.env)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/backend/.env"; set +a

OUT="${1:-$ROOT/backups/$(date +%F_%H%M)}"
mkdir -p "$OUT"

mongodump --uri "$MONGO_URL" --db "$DB_NAME" --gzip --archive="$OUT/$DB_NAME.archive.gz"
tar -czf "$OUT/uploads.tar.gz" -C "$ROOT/backend" uploads

echo "backup written to $OUT"
