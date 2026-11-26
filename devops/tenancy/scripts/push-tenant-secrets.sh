#!/usr/bin/env bash
# Push the local .env secrets to tenant SSM SecureString parameters.
# Values are never printed and never written to Terraform state.
#
# Usage:
#   PROFILE=dc-tenant-dev TENANT=digitalcompanion-dev \
#     bash devops/tenancy/scripts/push-tenant-secrets.sh
set -euo pipefail

PROFILE="${PROFILE:-dc-tenant-dev}"
TENANT="${TENANT:-digitalcompanion-dev}"
REGION="${REGION:-us-east-1}"
PARAM_PATH="${PARAM_PATH:-/digitalcompanion/${TENANT}}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)

if [ ! -f "${ROOT}/.env" ]; then
  echo "Missing ${ROOT}/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "${ROOT}/.env"
set +a

for name in OPENROUTER_API_KEY DEEPGRAM_API_KEY LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  if [ -z "${!name:-}" ]; then
    echo "Missing ${name} in .env" >&2
    exit 1
  fi
done

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)

put_secret() {
  local name="$1"
  local value="$2"
  aws ssm put-parameter \
    --profile "$PROFILE" \
    --region "$REGION" \
    --name "${PARAM_PATH}/${name}" \
    --value "$value" \
    --type SecureString \
    --overwrite >/dev/null
}

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  POSTGRES_PASSWORD=$(aws ssm get-parameter \
    --profile "$PROFILE" \
    --region "$REGION" \
    --name "${PARAM_PATH}/POSTGRES_PASSWORD" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || true)
  if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
  fi
fi

put_secret OPENROUTER_API_KEY "$OPENROUTER_API_KEY"
put_secret DEEPGRAM_API_KEY "$DEEPGRAM_API_KEY"
put_secret LIVEKIT_URL "$LIVEKIT_URL"
put_secret LIVEKIT_API_KEY "$LIVEKIT_API_KEY"
put_secret LIVEKIT_API_SECRET "$LIVEKIT_API_SECRET"
put_secret POSTGRES_PASSWORD "$POSTGRES_PASSWORD"

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  put_secret ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
fi

echo "Pushed secrets to ${PARAM_PATH} (values not displayed)."
echo "Account: ${ACCOUNT_ID} (local output only; never commit)."
