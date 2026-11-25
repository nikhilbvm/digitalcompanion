#!/usr/bin/env bash
# Create the monthly budget + email alerts in a tenant account.
# Run from the management account profile (dc-admin) after the account is created.
#
# Usage:
#   ACCOUNT_ID=123456789012 ALERT_EMAIL=you@example.com BUDGET_USD=25 \
#     bash devops/tenancy/scripts/setup-tenant-budget.sh
set -euo pipefail

: "${ACCOUNT_ID:?ACCOUNT_ID is required}"
: "${ALERT_EMAIL:?ALERT_EMAIL is required}"
BUDGET_USD="${BUDGET_USD:-25}"
PROFILE="${PROFILE:-dc-admin}"
REGION="${REGION:-us-east-1}"
ROLE_NAME="${ROLE_NAME:-OrganizationAccountAccessRole}"
BUDGET_NAME="${BUDGET_NAME:-digitalcompanion-dev-monthly}"
TOPIC_NAME="${TOPIC_NAME:-dc-budget-alerts}"

echo "==> Assuming $ROLE_NAME in $ACCOUNT_ID"
CREDS=$(aws sts assume-role \
  --profile "$PROFILE" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}" \
  --role-session-name "dc-budget-setup" \
  --query 'Credentials' --output json)

export AWS_ACCESS_KEY_ID=$(printf '%s' "$CREDS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessKeyId"])')
export AWS_SECRET_ACCESS_KEY=$(printf '%s' "$CREDS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["SecretAccessKey"])')
export AWS_SESSION_TOKEN=$(printf '%s' "$CREDS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["SessionToken"])')
unset AWS_PROFILE

echo "==> Ensuring SNS topic $TOPIC_NAME"
TOPIC_ARN=$(aws sns create-topic --name "$TOPIC_NAME" --region "$REGION" --query 'TopicArn' --output text)
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --region "$REGION" >/dev/null || true
echo "topic: $TOPIC_ARN"
echo "Confirm the SNS email subscription sent to $ALERT_EMAIL."

BUDGET_JSON=$(mktemp)
NOTIF_JSON=$(mktemp)
trap 'rm -f "$BUDGET_JSON" "$NOTIF_JSON"' EXIT

cat > "$BUDGET_JSON" <<EOF
{
  "BudgetName": "${BUDGET_NAME}",
  "BudgetLimit": { "Amount": "${BUDGET_USD}", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
EOF

python3 - "$TOPIC_ARN" "$NOTIF_JSON" <<'PY'
import json, sys
arn, path = sys.argv[1], sys.argv[2]
items = []
for threshold in (50, 80, 100):
    items.append({
        "Notification": {
            "NotificationType": "ACTUAL",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": threshold,
            "ThresholdType": "PERCENTAGE",
        },
        "Subscribers": [{"SubscriptionType": "SNS", "Address": arn}],
    })
open(path, "w").write(json.dumps(items, indent=2))
PY

echo "==> Creating budget $BUDGET_NAME (USD $BUDGET_USD/month)"
if aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "budget already exists; skipping create"
else
  aws budgets create-budget \
    --account-id "$ACCOUNT_ID" \
    --budget "file://$BUDGET_JSON" \
    --notifications-with-subscribers "file://$NOTIF_JSON" \
    --region "$REGION" >/dev/null
  echo "budget created with 50/80/100% ACTUAL alerts"
fi

echo "Done. Subscriptions must be confirmed by email before alerts fire."
