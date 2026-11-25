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

echo
echo "Next steps:"
echo "  1. Fill .env (Anthropic, Deepgram, LiveKit, Supabase)."
echo "  2. Run the SQL in supabase/migrations/0001_init.sql in your Supabase project."
echo "  3. pnpm dev   → web :3000 · api :4000 · agent worker"
echo "  4. Open http://localhost:3000/admin and create a test person."
echo
echo "Docs: docs/local-dev.md"
