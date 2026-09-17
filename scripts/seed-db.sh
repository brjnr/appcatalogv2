#!/usr/bin/env bash
# Seed the database with starter categories, applications and demo accounts.
# Destructive for apps/categories/users/sessions; safe to re-run (idempotent).
set -euo pipefail
cd "$(dirname "$0")/../backend"
exec "${PYTHON:-python}" seed.py
