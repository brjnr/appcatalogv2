#!/usr/bin/env bash
# Everything that must be green before a push: backend tests, frontend types, lint.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "--- backend: pytest"
( cd "$ROOT/backend" && BACKEND_URL="${BACKEND_URL:-http://localhost:8001}" "${PYTHON:-python}" -m pytest )

echo "--- frontend: typecheck"
( cd "$ROOT/frontend" && yarn typecheck )

echo "--- frontend: lint"
( cd "$ROOT/frontend" && yarn lint )

echo "all checks passed"
