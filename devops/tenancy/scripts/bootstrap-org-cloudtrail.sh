#!/usr/bin/env bash
# Create/reuse the organization CloudTrail trail and its private log bucket.
# Run from the management account with the dc-admin SSO profile.
#
# Usage:
#   PROFILE=dc-admin bash devops/tenancy/scripts/bootstrap-org-cloudtrail.sh
set -euo pipefail

PROFILE="${PROFILE:-dc-admin}"
REGION="${REGION:-us-east-1}"
TRAIL_NAME="${TRAIL_NAME:-dc-org-trail}"
PROJECT="${PROJECT:-digitalcompanion}"
OWNER="${OWNER:-nikhil}"

IDENTITY=$(aws sts get-caller-identity --profile "$PROFILE" --output json)
ACCOUNT_ID=$(printf '%s' "$IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Account"])')
ARN=$(printf '%s' "$IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Arn"])')

if printf '%s' "$ARN" | grep -qE ':(root|user/)'; then
  echo "Refusing to configure CloudTrail with root or an IAM user. Use the management SSO role." >&2
  exit 1
fi

BUCKET="${BUCKET:-dc-cloudtrail-${ACCOUNT_ID}}"

echo "==> CloudTrail log bucket: ${BUCKET}"
if ! aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" >/dev/null 2>&1; then
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --profile "$PROFILE" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}" --profile "$PROFILE" >/dev/null
  fi
fi

aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled \
  --profile "$PROFILE"
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  --profile "$PROFILE"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true' \
  --profile "$PROFILE"
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}' \
  --profile "$PROFILE"
aws s3api put-bucket-tagging --bucket "$BUCKET" --profile "$PROFILE" \
  --tagging "{\"TagSet\":[{\"Key\":\"project\",\"Value\":\"${PROJECT}\"},{\"Key\":\"purpose\",\"Value\":\"cloudtrail\"},{\"Key\":\"owner\",\"Value\":\"${OWNER}\"},{\"Key\":\"managed-by\",\"Value\":\"bootstrap\"}]}"

aws s3api put-bucket-policy --bucket "$BUCKET" --profile "$PROFILE" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"AWSCloudTrailAclCheck\",
      \"Effect\": \"Allow\",
      \"Principal\": {\"Service\": \"cloudtrail.amazonaws.com\"},
      \"Action\": \"s3:GetBucketAcl\",
      \"Resource\": \"arn:aws:s3:::${BUCKET}\"
    },
    {
      \"Sid\": \"AWSCloudTrailWrite\",
      \"Effect\": \"Allow\",
      \"Principal\": {\"Service\": \"cloudtrail.amazonaws.com\"},
      \"Action\": \"s3:PutObject\",
      \"Resource\": \"arn:aws:s3:::${BUCKET}/AWSLogs/*\",
      \"Condition\": {\"StringEquals\": {\"s3:x-amz-acl\": \"bucket-owner-full-control\"}}
    },
    {
      \"Sid\": \"DenyInsecureTransport\",
      \"Effect\": \"Deny\",
      \"Principal\": \"*\",
      \"Action\": \"s3:*\",
      \"Resource\": [\"arn:aws:s3:::${BUCKET}\", \"arn:aws:s3:::${BUCKET}/*\"],
      \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
    }
  ]
}"

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --profile "$PROFILE" \
  --lifecycle-configuration '{"Rules":[{"ID":"expire-cloudtrail","Status":"Enabled","Filter":{"Prefix":"AWSLogs/"},"Expiration":{"Days":365},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'

echo "==> Organization trail: ${TRAIL_NAME}"
if aws cloudtrail describe-trails --profile "$PROFILE" --region "$REGION" \
  --trail-name-list "$TRAIL_NAME" --query 'trailList[0].Name' --output text 2>/dev/null | grep -qx "$TRAIL_NAME"; then
  echo "    trail exists; updating configuration"
  aws cloudtrail update-trail --profile "$PROFILE" --region "$REGION" \
    --name "$TRAIL_NAME" \
    --s3-bucket-name "$BUCKET" \
    --is-organization-trail \
    --is-multi-region-trail \
    --enable-log-file-validation >/dev/null
else
  aws cloudtrail create-trail --profile "$PROFILE" --region "$REGION" \
    --name "$TRAIL_NAME" \
    --s3-bucket-name "$BUCKET" \
    --is-organization-trail \
    --is-multi-region-trail \
    --enable-log-file-validation \
    --tags-list "[{\"Key\":\"project\",\"Value\":\"${PROJECT}\"},{\"Key\":\"owner\",\"Value\":\"${OWNER}\"},{\"Key\":\"managed-by\",\"Value\":\"bootstrap\"}]" >/dev/null
fi

aws cloudtrail start-logging --profile "$PROFILE" --region "$REGION" --name "$TRAIL_NAME"
sleep 3
STATUS=$(aws cloudtrail get-trail-status --profile "$PROFILE" --region "$REGION" --name "$TRAIL_NAME" \
  --query 'IsLogging' --output text)
echo "    IsLogging: ${STATUS}"
if [ "$STATUS" != "True" ]; then
  echo "CloudTrail did not report logging enabled." >&2
  exit 1
fi

echo "CloudTrail organization trail is logging to ${BUCKET}."
echo "This covers the tenant account through the organization."
