#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Fail if a tracked file contains something that looks like a live API key.
# `.env` itself is gitignored; this only scans tracked files.
PATTERN='DEEPGRAM_API_KEY=[A-Za-z0-9]{20,}|OPENROUTER_API_KEY=sk-or-[A-Za-z0-9_-]{10,}|ANTHROPIC_API_KEY=sk-ant-[A-Za-z0-9_-]{10,}|LIVEKIT_API_SECRET=[A-Za-z0-9]{20,}'

if matches=$(git grep -nEI "$PATTERN" -- ':!pnpm-lock.yaml' 2>/dev/null); then
  echo "Potential secrets found in tracked files (values redacted):" >&2
  printf '%s\n' "$matches" | sed -E 's/=.*/=<redacted>/' >&2
  exit 1
fi

echo "Secret scan passed."
