#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Run scripts/setup.sh and fill in the keys." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed. Run scripts/setup.sh first." >&2
  exit 1
fi

echo "Starting web (:3000), api (:4000) and the LiveKit agent worker."
echo "The agent exits early if LiveKit/Deepgram/Supabase keys are missing; web + api keep running."
echo

exec pnpm exec concurrently \
  --names api,agent,web \
  --prefix-colors blue,magenta,green \
  "pnpm --filter @companion/api dev" \
  "pnpm --filter @companion/agent dev" \
  "pnpm --filter @companion/web dev"
