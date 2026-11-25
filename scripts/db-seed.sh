#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

SEED="${1:-db/seed.sql}"

if [ -z "${DATABASE_URL:-}" ] || printf '%s' "$DATABASE_URL" | grep -q '@localhost:'; then
  if docker compose ps db >/dev/null 2>&1; then
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -U companion -d digitalcompanion < "$SEED"
    exit 0
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set and the local compose database is not running." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to seed a non-local DATABASE_URL." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED"
