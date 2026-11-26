#!/usr/bin/env bash
# Create the Terraform state bucket + DynamoDB lock table in a tenant account and
# write a local (gitignored) backend.hcl for that tenant's stack.
#
# Usage:
#   PROFILE=dc-tenant-dev TENANT=digitalcompanion-dev \
#     bash devops/tenancy/scripts/bootstrap-tenant-backend.sh
#
# Requires an authenticated SSO session. Creates AWS resources, but no application
# resources. Safe to re-run.
set -euo pipefail

PROFILE="${PROFILE:-dc-tenant-dev}"
TENANT="${TENANT:-digitalcompanion-dev}"
REGION="${REGION:-us-east-1}"
PROJECT="${PROJECT:-digitalcompanion}"
ENV="${ENV:-dev}"
OWNER="${OWNER:-nikhil}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/../../.." && pwd)
STACK_DIR="${STACK_DIR:-${REPO_ROOT}/devops/terraform/stacks/${TENANT}}"
LOCK_TABLE="${LOCK_TABLE:-dc-tfstate-lock}"

echo "==> Checking AWS identity (${PROFILE})"
IDENTITY=$(aws sts get-caller-identity --profile "$PROFILE" --output json)
ACCOUNT_ID=$(printf '%s' "$IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Account"])')
ARN=$(printf '%s' "$IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Arn"])')

if printf '%s' "$ARN" | grep -q ':root$'; then
  echo "Refusing to bootstrap with the tenant root user. Use an SSO/admin role." >&2
  exit 1
fi

if printf '%s' "$ARN" | grep -q ':user/'; then
  echo "Refusing to bootstrap with an IAM user. Use an SSO/admin role." >&2
  exit 1
fi

STATE_BUCKET="${STATE_BUCKET:-dc-tfstate-${ACCOUNT_ID}}"
STATE_KEY="${STATE_KEY:-digitalcompanion/${TENANT}/terraform.tfstate}"

echo "==> State bucket: ${STATE_BUCKET} (${REGION})"
if aws s3api head-bucket --bucket "$STATE_BUCKET" --profile "$PROFILE" >/dev/null 2>&1; then
  echo "    bucket already exists"
  BUCKET_REGION=$(aws s3api get-bucket-location --bucket "$STATE_BUCKET" --profile "$PROFILE" --query LocationConstraint --output text 2>/dev/null || true)
  if [ -n "$BUCKET_REGION" ] && [ "$BUCKET_REGION" != "None" ] && [ "$BUCKET_REGION" != "$REGION" ]; then
    echo "    bucket is in ${BUCKET_REGION}, expected ${REGION}" >&2
    exit 1
  fi
elif [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" --profile "$PROFILE" >/dev/null
else
  aws s3api create-bucket --bucket "$STATE_BUCKET" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=${REGION}" --profile "$PROFILE" >/dev/null
fi

aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" --versioning-configuration Status=Enabled \
  --profile "$PROFILE"
aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  --profile "$PROFILE"
aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true' \
  --profile "$PROFILE"
aws s3api put-bucket-ownership-controls --bucket "$STATE_BUCKET" \
  --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}' \
  --profile "$PROFILE"
aws s3api put-bucket-policy --bucket "$STATE_BUCKET" --profile "$PROFILE" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"DenyInsecureTransport\",
    \"Effect\": \"Deny\",
    \"Principal\": \"*\",
    \"Action\": \"s3:*\",
    \"Resource\": [
      \"arn:aws:s3:::${STATE_BUCKET}\",
      \"arn:aws:s3:::${STATE_BUCKET}/*\"
    ],
    \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
  }]
}"
aws s3api put-bucket-tagging --bucket "$STATE_BUCKET" --profile "$PROFILE" \
  --tagging "{\"TagSet\":[{\"Key\":\"project\",\"Value\":\"${PROJECT}\"},{\"Key\":\"env\",\"Value\":\"${ENV}\"},{\"Key\":\"tenant\",\"Value\":\"${TENANT}\"},{\"Key\":\"managed-by\",\"Value\":\"bootstrap\"},{\"Key\":\"owner\",\"Value\":\"${OWNER}\"}]}"

echo "==> DynamoDB lock table: ${LOCK_TABLE}"
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" --profile "$PROFILE" >/dev/null 2>&1; then
  echo "    table already exists"
  aws dynamodb update-table --table-name "$LOCK_TABLE" --deletion-protection-enabled \
    --region "$REGION" --profile "$PROFILE" >/dev/null
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --sse-specification Enabled=true \
    --deletion-protection-enabled \
    --region "$REGION" --profile "$PROFILE" >/dev/null
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION" --profile "$PROFILE"
fi
TABLE_ARN=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" \
  --profile "$PROFILE" --query 'Table.TableArn' --output text)
aws dynamodb tag-resource --resource-arn "$TABLE_ARN" --region "$REGION" --profile "$PROFILE" \
  --tags "[{\"Key\":\"project\",\"Value\":\"${PROJECT}\"},{\"Key\":\"env\",\"Value\":\"${ENV}\"},{\"Key\":\"tenant\",\"Value\":\"${TENANT}\"},{\"Key\":\"managed-by\",\"Value\":\"bootstrap\"},{\"Key\":\"owner\",\"Value\":\"${OWNER}\"}]"
aws dynamodb update-continuous-backups --table-name "$LOCK_TABLE" --region "$REGION" \
  --profile "$PROFILE" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null || true

mkdir -p "$STACK_DIR"
BACKEND_FILE="${STACK_DIR}/backend.hcl"
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT
cat > "$TMP_FILE" <<EOF
bucket         = "${STATE_BUCKET}"
key            = "${STATE_KEY}"
region         = "${REGION}"
dynamodb_table = "${LOCK_TABLE}"
encrypt        = true
EOF
chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$BACKEND_FILE"

echo
echo "Backend ready. Local config written to ${BACKEND_FILE} (gitignored)."
echo "Next:"
echo "  cd ${STACK_DIR}"
echo "  AWS_PROFILE=${PROFILE} terraform init -backend-config=backend.hcl"
echo "  AWS_PROFILE=${PROFILE} terraform plan -var-file=terraform.tfvars"
echo
echo "No application resources were created."
