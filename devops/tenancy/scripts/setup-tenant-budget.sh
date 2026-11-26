#!/usr/bin/env bash
# Create the monthly budget + direct-email alerts in a tenant account.
# AWS Budgets supports EMAIL subscribers directly, so no SNS confirmation is needed.
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
OLD_TOPIC_NAME="${OLD_TOPIC_NAME:-dc-budget-alerts}"

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

python3 - "$ALERT_EMAIL" "$NOTIF_JSON" <<'PY'
import json, sys
email, path = sys.argv[1], sys.argv[2]
items = []
for threshold in (50, 80, 100):
    items.append({
        "Notification": {
            "NotificationType": "ACTUAL",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": threshold,
            "ThresholdType": "PERCENTAGE",
        },
        # Direct email subscriber; AWS Budgets sends without SNS confirmation.
        "Subscribers": [{"SubscriptionType": "EMAIL", "Address": email}],
    })
open(path, "w").write(json.dumps(items, indent=2))
PY

echo "==> Installing budget $BUDGET_NAME (USD $BUDGET_USD/month, direct email)"
if aws budgets describe-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "existing budget found; replacing it to remove the SNS subscriber"
  aws budgets delete-budget --account-id "$ACCOUNT_ID" --budget-name "$BUDGET_NAME" --region "$REGION"
fi

aws budgets create-budget \
  --account-id "$ACCOUNT_ID" \
  --budget "file://$BUDGET_JSON" \
  --notifications-with-subscribers "file://$NOTIF_JSON" \
  --region "$REGION" >/dev/null

echo "==> Cleaning up the old SNS topic if present"
TOPIC_ARN=$(aws sns list-topics --region "$REGION" --query "Topics[?ends_with(TopicArn, ':${OLD_TOPIC_NAME}')].TopicArn" --output text | head -1)
if [ -n "$TOPIC_ARN" ] && [ "$TOPIC_ARN" != "None" ]; then
  aws sns delete-topic --topic-arn "$TOPIC_ARN" --region "$REGION" || true
  echo "deleted $TOPIC_ARN"
fi

echo "Done. AWS Budgets sends alerts directly to $ALERT_EMAIL; no SNS confirmation is involved."
