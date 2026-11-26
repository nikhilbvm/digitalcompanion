#!/usr/bin/env bash
# Deploy a built API/agent tag to the tenant EC2 host through SSM Run Command.
# Build and push images first with build-tenant-images.sh.
#
# Usage:
#   PROFILE=dc-tenant-dev TAG=v0.1.0-abc1234 \
#     bash devops/tenancy/scripts/deploy-tenant-app.sh
set -euo pipefail

PROFILE="${PROFILE:-dc-tenant-dev}"
TENANT="${TENANT:-digitalcompanion-dev}"
REGION="${REGION:-us-east-1}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
STACK_DIR="${ROOT}/devops/terraform/stacks/${TENANT}"
PARAM_PATH="/digitalcompanion/${TENANT}"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"

if [ ! -f "${STACK_DIR}/backend.hcl" ]; then
  echo "Terraform backend config missing; run bootstrap first." >&2
  exit 1
fi

tf_out() {
  terraform -chdir="$STACK_DIR" output -raw "$1"
}

API_URL=$(tf_out api_url)
WEB_URL=$(tf_out web_url)
ARTIFACTS_BUCKET=$(tf_out artifacts_bucket)
INSTANCE_ID=$(tf_out instance_id)
ECR_JSON=$(terraform -chdir="$STACK_DIR" output -json ecr_repository_urls)
API_REPO=$(printf '%s' "$ECR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["api"])')
AGENT_REPO=$(printf '%s' "$ECR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["agent"])')
API_IMAGE="${API_REPO}:${TAG}"
AGENT_IMAGE="${AGENT_REPO}:${TAG}"

for repo in "$API_REPO" "$AGENT_REPO"; do
  repo_name="${repo##*/}"
  if ! aws ecr describe-images --profile "$PROFILE" --region "$REGION" \
    --repository-name "$repo_name" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
    echo "Image tag ${TAG} is missing from ECR repository ${repo_name}." >&2
    echo "Run build-tenant-images.sh with TAG=${TAG} first." >&2
    exit 1
  fi
done

echo "==> Writing deploy config to SSM"
aws ssm put-parameter --profile "$PROFILE" --region "$REGION" \
  --name "${PARAM_PATH}/config/API_IMAGE" --value "$API_IMAGE" --type String --overwrite >/dev/null
aws ssm put-parameter --profile "$PROFILE" --region "$REGION" \
  --name "${PARAM_PATH}/config/AGENT_IMAGE" --value "$AGENT_IMAGE" --type String --overwrite >/dev/null
aws ssm put-parameter --profile "$PROFILE" --region "$REGION" \
  --name "${PARAM_PATH}/config/CORS_ORIGIN" --value "$WEB_URL" --type String --overwrite >/dev/null
aws ssm put-parameter --profile "$PROFILE" --region "$REGION" \
  --name "${PARAM_PATH}/config/DEPLOY_TAG" --value "$TAG" --type String --overwrite >/dev/null

for name in OPENROUTER_API_KEY DEEPGRAM_API_KEY LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET POSTGRES_PASSWORD; do
  if ! aws ssm get-parameter --profile "$PROFILE" --region "$REGION" \
    --name "${PARAM_PATH}/${name}" >/dev/null 2>&1; then
    echo "Missing SSM secret ${PARAM_PATH}/${name}; run push-tenant-secrets.sh first." >&2
    exit 1
  fi
done

WORK=$(mktemp -d)
BUNDLE=$(mktemp)
trap 'rm -rf "$WORK"; rm -f "$BUNDLE"' EXIT

mkdir -p "$WORK/migrations"
cp "$ROOT/deploy/tenant/docker-compose.yml" "$WORK/docker-compose.yml"
cp "$ROOT/deploy/tenant/render-env.sh" "$WORK/render-env.sh"
cp "$ROOT"/db/migrations/*.sql "$WORK/migrations/"
chmod +x "$WORK/render-env.sh"

tar -C "$WORK" -czf "$BUNDLE" .
aws s3 cp "$BUNDLE" "s3://${ARTIFACTS_BUCKET}/deploy/${TAG}/bundle.tar.gz" \
  --profile "$PROFILE" --region "$REGION" >/dev/null

echo "==> Waiting for SSM to see the instance"
for _ in $(seq 1 60); do
  STATE=$(aws ssm describe-instance-information --profile "$PROFILE" --region "$REGION" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
  if [ "$STATE" = "Online" ]; then
    break
  fi
  sleep 10
done
if [ "${STATE:-}" != "Online" ]; then
  echo "Instance ${INSTANCE_ID} is not online in SSM." >&2
  exit 1
fi

PARAMS_FILE=$(mktemp)
trap 'rm -rf "$WORK"; rm -f "$BUNDLE"; rm -f "$PARAMS_FILE"' EXIT

python3 - "$ARTIFACTS_BUCKET" "$TAG" "$PARAM_PATH" "$REGION" > "$PARAMS_FILE" <<'PY'
import json
import sys

bucket, tag, param_path, region = sys.argv[1:5]
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

echo "==> Sending deploy command for ${TAG}"
COMMAND_ID=$(aws ssm send-command \
  --profile "$PROFILE" \
  --region "$REGION" \
  --document-name "AWS-RunShellScript" \
  --instance-ids "$INSTANCE_ID" \
  --comment "Digital Companion deploy ${TAG}" \
  --parameters "file://${PARAMS_FILE}" \
  --query 'Command.CommandId' \
  --output text)

for _ in $(seq 1 60); do
  STATUS=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text 2>/dev/null || true)
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut)
      break
      ;;
  esac
  sleep 5
done

echo "==> SSM command ${COMMAND_ID}: ${STATUS:-Unknown}"
aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' --output text || true
if [ "$STATUS" != "Success" ]; then
  echo "--- stderr ---" >&2
  aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'StandardErrorContent' --output text >&2 || true
  exit 1
fi

echo "==> Checking API through CloudFront"
for _ in $(seq 1 12); do
  if curl -fsS "${API_URL}/health"; then
    echo
    echo "Deployed ${TAG}"
    exit 0
  fi
  sleep 10
done
echo "API CloudFront health check failed at ${API_URL}/health" >&2
exit 1
