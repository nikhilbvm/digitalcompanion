#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

MIGRATION="${1:-db/migrations/0001_init.sql}"

if [ ! -f "$MIGRATION" ]; then
  echo "Migration not found: $MIGRATION" >&2
  exit 1
fi

# Local compose Postgres: use the container's psql so no local client is needed.
if [ -z "${DATABASE_URL:-}" ] || printf '%s' "$DATABASE_URL" | grep -q '@localhost:'; then
  if docker compose ps db >/dev/null 2>&1; then
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -U companion -d digitalcompanion < "$MIGRATION"
    exit 0
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set and the local compose database is not running." >&2
  echo "Run pnpm db:up, or set DATABASE_URL for RDS." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to migrate a non-local DATABASE_URL." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION"
