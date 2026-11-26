#!/usr/bin/env bash
# Render /opt/digitalcompanion/.env from SSM. Runs on the EC2 host.
# The file is mode 600 and never committed.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PARAM_PATH="${PARAM_PATH:?PARAM_PATH is required}"

get_param() {
  aws ssm get-parameter \
    --region "$REGION" \
    --name "${PARAM_PATH}/$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
}

get_config() {
  aws ssm get-parameter \
    --region "$REGION" \
    --name "${PARAM_PATH}/config/$1" \
    --query 'Parameter.Value' \
    --output text
}

API_IMAGE=$(get_config API_IMAGE)
AGENT_IMAGE=$(get_config AGENT_IMAGE)
CORS_ORIGIN=$(get_config CORS_ORIGIN)
POSTGRES_PASSWORD=$(get_param POSTGRES_PASSWORD)
OPENROUTER_API_KEY=$(get_param OPENROUTER_API_KEY)
DEEPGRAM_API_KEY=$(get_param DEEPGRAM_API_KEY)
LIVEKIT_URL=$(get_param LIVEKIT_URL)
LIVEKIT_API_KEY=$(get_param LIVEKIT_API_KEY)
LIVEKIT_API_SECRET=$(get_param LIVEKIT_API_SECRET)

ANTHROPIC_API_KEY=""
if aws ssm get-parameter --region "$REGION" --name "${PARAM_PATH}/ANTHROPIC_API_KEY" >/dev/null 2>&1; then
  ANTHROPIC_API_KEY=$(get_param ANTHROPIC_API_KEY)
fi

TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT

{
  printf '%s=%s\n' API_IMAGE "$API_IMAGE"
  printf '%s=%s\n' AGENT_IMAGE "$AGENT_IMAGE"
  printf '%s=%s\n' POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  printf '%s=%s\n' DATABASE_URL "postgres://companion:${POSTGRES_PASSWORD}@db:5432/digitalcompanion"
  printf '%s=%s\n' DATABASE_SSL "false"
  printf '%s=%s\n' API_PORT "4000"
  printf '%s=%s\n' PORT "4000"
  printf '%s=%s\n' CORS_ORIGIN "$CORS_ORIGIN"
  printf '%s=%s\n' LLM_PROVIDER "openrouter"
  printf '%s=%s\n' LLM_EFFORT "low"
  printf '%s=%s\n' OPENROUTER_API_KEY "$OPENROUTER_API_KEY"
  printf '%s=%s\n' OPENROUTER_MODEL "anthropic/claude-haiku-5.5"
  printf '%s=%s\n' OPENROUTER_BASE_URL "https://openrouter.ai/api/v1"
  printf '%s=%s\n' OPENROUTER_PROVIDER "anthropic"
  printf '%s=%s\n' OPENROUTER_ALLOW_FALLBACKS "false"
  printf '%s=%s\n' OPENROUTER_DATA_COLLECTION "deny"
  printf '%s=%s\n' DEEPGRAM_API_KEY "$DEEPGRAM_API_KEY"
  printf '%s=%s\n' LIVEKIT_URL "$LIVEKIT_URL"
  printf '%s=%s\n' LIVEKIT_API_KEY "$LIVEKIT_API_KEY"
  printf '%s=%s\n' LIVEKIT_API_SECRET "$LIVEKIT_API_SECRET"
  printf '%s=%s\n' AGENT_NAME "dc"
  printf '%s=%s\n' VOICE_MAX_TOKENS "300"
  printf '%s=%s\n' VOICE_STT_MODEL "nova-3"
  printf '%s=%s\n' VOICE_TTS_MODEL "aura-2-andromeda-en"
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    printf '%s=%s\n' ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
  fi
} > "$TMP_ENV"

chmod 600 "$TMP_ENV"
mv "$TMP_ENV" /opt/digitalcompanion/.env
trap - EXIT
echo "Rendered /opt/digitalcompanion/.env"
