#!/usr/bin/env bash
# Build the API and agent images for the tenant's Linux/arm64 EC2 host and
# push them to the tenant ECR. Run after Terraform has created ECR.
#
# Usage:
#   PROFILE=dc-tenant-dev TAG=v0.1.0-abc1234 \
#     bash devops/tenancy/scripts/build-tenant-images.sh
set -euo pipefail

export AWS_PROFILE="${PROFILE:-dc-tenant-dev}"
PROFILE="${PROFILE:-dc-tenant-dev}"
TENANT="${TENANT:-digitalcompanion-dev}"
REGION="${REGION:-us-east-1}"
PLATFORM="${PLATFORM:-linux/arm64}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
STACK_DIR="${ROOT}/devops/terraform/stacks/${TENANT}"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"

if [ ! -f "${STACK_DIR}/backend.hcl" ]; then
  echo "Terraform backend config missing; run bootstrap first." >&2
  exit 1
fi

ECR_JSON=$(terraform -chdir="$STACK_DIR" output -json ecr_repository_urls)
API_REPO=$(printf '%s' "$ECR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["api"])')
AGENT_REPO=$(printf '%s' "$ECR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["agent"])')
REGISTRY="${API_REPO%%/*}"

echo "==> Logging in to ${REGISTRY}"
aws ecr get-login-password --profile "$PROFILE" --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

echo "==> Building API for ${PLATFORM}"
docker buildx build \
  --platform "$PLATFORM" \
  --provenance=false \
  -f "$ROOT/apps/api/Dockerfile" \
  -t "${API_REPO}:${TAG}" \
  --push "$ROOT"

echo "==> Building agent for ${PLATFORM}"
docker buildx build \
  --platform "$PLATFORM" \
  --provenance=false \
  -f "$ROOT/apps/agent/Dockerfile" \
  -t "${AGENT_REPO}:${TAG}" \
  --push "$ROOT"

echo
echo "Pushed:"
echo "  ${API_REPO}:${TAG}"
echo "  ${AGENT_REPO}:${TAG}"
echo
echo "Deploy with TAG=${TAG} bash devops/tenancy/scripts/deploy-tenant-app.sh"
