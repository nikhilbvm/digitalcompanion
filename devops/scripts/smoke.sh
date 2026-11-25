#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

API_BASE="${API_BASE:-http://localhost:4000}"

echo "Health: $API_BASE/health"
body=$(curl -fsS "$API_BASE/health")
echo "$body"

if ! printf '%s' "$body" | grep -q '"ok":true'; then
  echo "Smoke failed: health did not report ok=true" >&2
  exit 1
fi

if [ -n "${PERSON_ID:-}" ]; then
  echo
  echo "Text turn for person $PERSON_ID (first 40 SSE lines):"
  curl -fsS -N -X POST "$API_BASE/chat" \
    -H 'Content-Type: application/json' \
    -d "{\"personId\":\"$PERSON_ID\",\"message\":\"Hello, how are you today?\"}" \
    | head -40
fi

echo
echo "Smoke passed."
