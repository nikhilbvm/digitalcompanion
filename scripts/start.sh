#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Starting built API and web (agent must run as a separate worker process)."
exec pnpm exec concurrently \
  --names api,web \
  --prefix-colors blue,green \
  "pnpm --filter @companion/api start" \
  "pnpm --filter @companion/web start"
