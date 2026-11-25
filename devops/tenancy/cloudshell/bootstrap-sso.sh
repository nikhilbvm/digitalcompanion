#!/usr/bin/env bash
# Run in AWS CloudShell in the MANAGEMENT account, after enabling IAM Identity Center
# in the console. The CreateInstance API is rejected for organization management
# accounts, so enabling the organization instance must be done in the console first.
#
# Edit the four values below, then paste this whole file into CloudShell.
# It creates/repairs: TenantAdmin permission set, your SSO user, management-account
# assignment. It prints the values needed for `aws configure sso` locally.
set -euo pipefail

# ---------------------------------------------------------------------------
# EDIT THESE
REGION="${REGION:-us-east-1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-you@example.com}"
ADMIN_USERNAME="${ADMIN_USERNAME:-nikhil-admin}"
ADMIN_GIVEN_NAME="${ADMIN_GIVEN_NAME:-Nikhil}"
ADMIN_FAMILY_NAME="${ADMIN_FAMILY_NAME:-Aggarwal}"
PERMISSION_SET_NAME="${PERMISSION_SET_NAME:-TenantAdmin}"
SESSION_DURATION="${SESSION_DURATION:-PT4H}"
MANAGED_POLICY_ARN="${MANAGED_POLICY_ARN:-arn:aws:iam::aws:policy/AdministratorAccess}"
# ---------------------------------------------------------------------------

echo "==> Verifying caller and management account"
IDENTITY=$(aws sts get-caller-identity --region "$REGION")
ACCOUNT_ID=$(printf '%s' "$IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Account"])')
ORG_MASTER=$(aws organizations describe-organization --region "$REGION" --query 'Organization.MasterAccountId' --output text)

echo "account: $ACCOUNT_ID"
echo "organization management: $ORG_MASTER"
if [ "$ACCOUNT_ID" != "$ORG_MASTER" ]; then
  echo "ERROR: run this in the organization MANAGEMENT account, not a member account." >&2
  exit 1
fi

echo "==> Finding IAM Identity Center instance in $REGION"
INSTANCE_ARN=$(aws sso-admin list-instances --region "$REGION" --query 'Instances[0].InstanceArn' --output text 2>/dev/null || true)
STORE_ID=$(aws sso-admin list-instances --region "$REGION" --query 'Instances[0].IdentityStoreId' --output text 2>/dev/null || true)

if [ -z "$INSTANCE_ARN" ] || [ "$INSTANCE_ARN" = "None" ]; then
  cat >&2 <<'EOF'
No IAM Identity Center instance found.

Enable it once in the console (management account, same region):
  IAM Identity Center -> Enable -> choose the region
Then re-run this script from CloudShell in that region.
EOF
  exit 1
fi

echo "instance: $INSTANCE_ARN"
echo "identity store: $STORE_ID"

echo "==> Ensuring permission set $PERMISSION_SET_NAME"
PS_ARN=""
for arn in $(aws sso-admin list-permission-sets --region "$REGION" --instance-arn "$INSTANCE_ARN" --query 'PermissionSets' --output text | tr '\t' '\n'); do
  name=$(aws sso-admin describe-permission-set --region "$REGION" --instance-arn "$INSTANCE_ARN" --permission-set-arn "$arn" --query 'PermissionSet.Name' --output text)
  if [ "$name" = "$PERMISSION_SET_NAME" ]; then PS_ARN="$arn"; break; fi
done

if [ -z "$PS_ARN" ]; then
  PS_ARN=$(aws sso-admin create-permission-set \
    --region "$REGION" \
    --instance-arn "$INSTANCE_ARN" \
    --name "$PERMISSION_SET_NAME" \
    --description "Digital Companion tenant administration" \
    --session-duration "$SESSION_DURATION" \
    --query 'PermissionSet.PermissionSetArn' --output text)
  echo "created permission set: $PS_ARN"
else
  echo "reusing permission set: $PS_ARN"
fi

echo "==> Attaching AdministratorAccess if needed"
if ! aws sso-admin list-managed-policies-in-permission-set \
  --region "$REGION" --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN" \
  --query 'AttachedManagedPolicies[].Arn' --output text | tr '\t' '\n' | grep -qx "$MANAGED_POLICY_ARN"; then
  aws sso-admin attach-managed-policy-to-permission-set \
    --region "$REGION" --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN" \
    --managed-policy-arn "$MANAGED_POLICY_ARN"
  echo "attached $MANAGED_POLICY_ARN"
else
  echo "AdministratorAccess already attached"
fi

echo "==> Ensuring SSO user $ADMIN_USERNAME"
USER_ID=$(aws identitystore list-users \
  --region "$REGION" --identity-store-id "$STORE_ID" \
  --query "Users[?UserName=='$ADMIN_USERNAME'].UserId" --output text | head -1)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "None" ]; then
  USER_ID=$(aws identitystore create-user \
    --region "$REGION" --identity-store-id "$STORE_ID" \
    --user-name "$ADMIN_USERNAME" \
    --display-name "$ADMIN_GIVEN_NAME $ADMIN_FAMILY_NAME" \
    --name "{\"GivenName\":\"$ADMIN_GIVEN_NAME\",\"FamilyName\":\"$ADMIN_FAMILY_NAME\"}" \
    --emails "[{\"Value\":\"$ADMIN_EMAIL\",\"Type\":\"Work\",\"Primary\":true}]" \
    --query 'UserId' --output text)
  echo "created user: $USER_ID"
else
  echo "reusing user: $USER_ID"
fi

echo "==> Assigning $PERMISSION_SET_NAME on management account $ACCOUNT_ID"
EXISTING=$(aws sso-admin list-account-assignments \
  --region "$REGION" --instance-arn "$INSTANCE_ARN" \
  --account-id "$ACCOUNT_ID" --permission-set-arn "$PS_ARN" \
  --query "AccountAssignments[?PrincipalId=='$USER_ID'].PrincipalId" --output text | head -1)

if [ -z "$EXISTING" ] || [ "$EXISTING" = "None" ]; then
  REQUEST_ID=$(aws sso-admin create-account-assignment \
    --region "$REGION" --instance-arn "$INSTANCE_ARN" \
    --target-id "$ACCOUNT_ID" --target-type AWS_ACCOUNT \
    --permission-set-arn "$PS_ARN" \
    --principal-type USER --principal-id "$USER_ID" \
    --query 'AccountAssignmentCreationStatus.RequestId' --output text)
  echo "assignment requested: $REQUEST_ID"
  echo "poll status with:"
  echo "  aws sso-admin describe-account-assignment-creation-status \\"
  echo "    --region $REGION --instance-arn $INSTANCE_ARN --request-id $REQUEST_ID"
else
  echo "assignment already exists"
fi

PORTAL_URL="https://${STORE_ID}.awsapps.com/start"
cat <<EOF

=== VALUES FOR LOCAL SSO (no secrets) ===
SSO start URL:      $PORTAL_URL
SSO region:         $REGION
Management account: $ACCOUNT_ID
Permission set:     $PERMISSION_SET_NAME
SSO user:           $ADMIN_USERNAME ($ADMIN_EMAIL)

Confirm the portal URL in the IAM Identity Center console if a custom alias was set.
Then locally run:
  aws configure sso --profile dc-admin
  # start URL: $PORTAL_URL
  # SSO region: $REGION
  # choose account $ACCOUNT_ID and role $PERMISSION_SET_NAME
  aws sso login --profile dc-admin
  aws sts get-caller-identity --profile dc-admin
EOF
