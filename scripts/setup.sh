#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Digital Companion — local setup"

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 22 ]; then
  echo "Node 22+ is required (found $(node --version)). See .nvmrc." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Enabling pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@10.34.9 --activate
fi

echo "Installing workspace dependencies..."
pnpm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in the API keys before running."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -n "${DATABASE_URL:-}" ] && ! printf '%s' "$DATABASE_URL" | grep -q '@localhost:'; then
  echo "DATABASE_URL points at a remote database; skipped the local Docker Postgres."
  echo "Apply the schema with: pnpm db:migrate"
elif docker info >/dev/null 2>&1; then
  echo "Starting local Postgres and applying the schema..."
  bash scripts/db-up.sh
  bash scripts/db-migrate.sh
else
  echo "Docker is not running; skipped local Postgres."
  echo "Start Docker and run: pnpm db:up && pnpm db:migrate"
  echo "Or point DATABASE_URL in .env at an existing RDS/Postgres instance."
fi

echo
echo "Next steps:"
echo "  1. Fill .env (Anthropic, Deepgram, LiveKit; DATABASE_URL is set for local Postgres)."
echo "  2. pnpm dev   → web :3000 · api :4000 · agent worker"
echo "  3. Open http://localhost:3000/admin and create a test person."
echo
echo "Docs: docs/local-dev.md"
