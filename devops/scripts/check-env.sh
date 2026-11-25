#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

missing_core=()
for name in ANTHROPIC_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!name:-}" ]; then missing_core+=("$name"); fi
done

missing_voice=()
for name in DEEPGRAM_API_KEY LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  if [ -z "${!name:-}" ]; then missing_voice+=("$name"); fi
done

missing_web=()
for name in NEXT_PUBLIC_API_BASE_URL; do
  if [ -z "${!name:-}" ]; then missing_web+=("$name"); fi
done

echo "Digital Companion environment check"
echo "  core (text chat + admin): $([ ${#missing_core[@]} -eq 0 ] && echo OK || echo MISSING)"
echo "  voice agent:              $([ ${#missing_voice[@]} -eq 0 ] && echo OK || echo MISSING)"
echo "  web:                      $([ ${#missing_web[@]} -eq 0 ] && echo OK || echo MISSING)"

status=0
if [ ${#missing_core[@]} -gt 0 ]; then
  echo "  missing core: ${missing_core[*]}" >&2
  status=1
fi
if [ ${#missing_voice[@]} -gt 0 ]; then
  echo "  voice will be unavailable; missing: ${missing_voice[*]}" >&2
fi
if [ ${#missing_web[@]} -gt 0 ]; then
  echo "  missing web: ${missing_web[*]}" >&2
  status=1
fi

exit "$status"
