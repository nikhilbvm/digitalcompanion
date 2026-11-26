#!/usr/bin/env bash
# Deploy a built image tag to the tenant from GitHub Actions.
# AWS credentials come from the workflow's OIDC role; no --profile is used.
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${TENANT_NAME:?TENANT_NAME is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${ARTIFACTS_BUCKET:?ARTIFACTS_BUCKET is required}"
: "${INSTANCE_ID:?INSTANCE_ID is required}"
: "${API_BASE_URL:?API_BASE_URL is required}"
: "${WEB_URL:?WEB_URL is required}"
: "${TAG:?TAG is required}"

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
PARAM_PATH="/digitalcompanion/${TENANT_NAME}"
API_IMAGE="${ECR_REGISTRY}/${TENANT_NAME}-api:${TAG}"
AGENT_IMAGE="${ECR_REGISTRY}/${TENANT_NAME}-agent:${TAG}"

for repo in "${TENANT_NAME}-api" "${TENANT_NAME}-agent"; do
  if ! aws ecr describe-images --region "$AWS_REGION" \
    --repository-name "$repo" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
    echo "Image tag ${TAG} is missing from ECR repository ${repo}." >&2
    exit 1
  fi
done

# Secrets are read on the instance by its role; the deploy role intentionally
# cannot read them. Missing secrets surface in the SSM deploy output.

echo "==> Writing SSM config for ${TAG}"
for pair in \
  "API_IMAGE=${API_IMAGE}" \
  "AGENT_IMAGE=${AGENT_IMAGE}" \
  "CORS_ORIGIN=${WEB_URL}" \
  "DEPLOY_TAG=${TAG}"; do
  key="${pair%%=*}"
  value="${pair#*=}"
  aws ssm put-parameter --region "$AWS_REGION" \
    --name "${PARAM_PATH}/config/${key}" --value "$value" --type String --overwrite >/dev/null
done

WORK=$(mktemp -d)
BUNDLE=$(mktemp)
PARAMS_FILE=$(mktemp)
trap 'rm -rf "$WORK"; rm -f "$BUNDLE" "$PARAMS_FILE"' EXIT

mkdir -p "$WORK/migrations"
cp "$ROOT/deploy/tenant/docker-compose.yml" "$WORK/docker-compose.yml"
cp "$ROOT/deploy/tenant/render-env.sh" "$WORK/render-env.sh"
cp "$ROOT"/db/migrations/*.sql "$WORK/migrations/"
chmod +x "$WORK/render-env.sh"
tar -C "$WORK" -czf "$BUNDLE" .
aws s3 cp "$BUNDLE" "s3://${ARTIFACTS_BUCKET}/deploy/${TAG}/bundle.tar.gz" \
  --region "$AWS_REGION" >/dev/null

echo "==> Waiting for SSM"
STATE=""
for _ in $(seq 1 60); do
  STATE=$(aws ssm describe-instance-information --region "$AWS_REGION" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
  if [ "$STATE" = "Online" ]; then break; fi
  sleep 10
done
if [ "$STATE" != "Online" ]; then
  echo "Instance ${INSTANCE_ID} is not online in SSM." >&2
  exit 1
fi

python3 - "$ARTIFACTS_BUCKET" "$TAG" "$PARAM_PATH" "$AWS_REGION" "$API_BASE_URL" "$WEB_URL" > "$PARAMS_FILE" <<'PY'
import json
import sys

bucket, tag, param_path, region, api_url, web_url = sys.argv[1:7]
commands = [
    "set -euo pipefail",
    "mkdir -p /opt/digitalcompanion",
    "for i in $(seq 1 60); do command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker && break; sleep 10; done",
    "command -v docker >/dev/null 2>&1 || { echo 'docker did not become ready' >&2; exit 1; }",
    "docker compose version",
    f"aws s3 cp s3://{bucket}/deploy/{tag}/bundle.tar.gz /tmp/dc-bundle.tar.gz",
    "tar -xzf /tmp/dc-bundle.tar.gz -C /opt/digitalcompanion",
    "cd /opt/digitalcompanion",
    "chmod +x render-env.sh",
    f"export AWS_REGION={region}",
    f"export PARAM_PATH={param_path}",
    "./render-env.sh",
    ". /opt/digitalcompanion/.env",
    "REGISTRY=${API_IMAGE%%/*}",
    "aws ecr get-login-password --region \"$AWS_REGION\" | docker login --username AWS --password-stdin \"$REGISTRY\"",
    "docker compose pull db api agent",
    "docker compose --profile tools run --rm migrate",
    "docker compose up -d --remove-orphans",
    "for i in $(seq 1 30); do if curl -fsS http://127.0.0.1:4000/health >/tmp/dc-health.json; then cat /tmp/dc-health.json; break; fi; sleep 5; done",
    "sleep 10",
    "docker compose ps",
    "docker compose ps --status running --services | grep -qx agent || { echo 'agent container is not running' >&2; docker compose logs --tail=100 agent; exit 1; }",
    "test -s /tmp/dc-health.json || { echo 'API health did not become ready' >&2; docker compose logs --tail=100 api; exit 1; }",
]
print(json.dumps({"commands": commands}))
PY

echo "==> Sending deploy command"
COMMAND_ID=$(aws ssm send-command --region "$AWS_REGION" \
  --document-name "AWS-RunShellScript" \
  --instance-ids "$INSTANCE_ID" \
  --comment "Digital Companion deploy ${TAG}" \
  --parameters "file://${PARAMS_FILE}" \
  --query 'Command.CommandId' --output text)

STATUS=""
for _ in $(seq 1 120); do
  STATUS=$(aws ssm get-command-invocation --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null || true)
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut) break ;;
  esac
  sleep 5
done

echo "==> SSM command ${COMMAND_ID}: ${STATUS:-Unknown}"
aws ssm get-command-invocation --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' --output text || true
if [ "$STATUS" != "Success" ]; then
  echo "--- stderr ---" >&2
  aws ssm get-command-invocation --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'StandardErrorContent' --output text >&2 || true
  exit 1
fi

echo "==> Checking API through CloudFront"
for _ in $(seq 1 12); do
  if curl -fsS "${API_BASE_URL}/health"; then
    echo
    echo "Deployed ${TAG}"
    exit 0
  fi
  sleep 10
done
echo "API health check failed at ${API_BASE_URL}/health" >&2
exit 1
