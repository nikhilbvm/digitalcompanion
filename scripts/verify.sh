#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> lint"
pnpm lint

echo "==> typecheck"
pnpm typecheck

echo "==> test"
pnpm test

echo "==> build"
pnpm build

echo
echo "All checks passed."
echo "Manual acceptance items that need real keys: voice call, Deepgram audio, LiveKit room."
