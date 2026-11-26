# AWS tenancy runbook

Applied-state log: [docs/history/aws-tenancy-log.md](../../docs/history/aws-tenancy-log.md).
Plan: [docs/planning/03-aws-tenancy.md](../../docs/planning/03-aws-tenancy.md).

Account IDs, root emails and other tenant identifiers are deliberately **not** in this public repo.
Keep them in the local ops record / password manager.

---

## 0. Terminology

| Term | Meaning here |
|---|---|
| **Organization** | The whole AWS Organizations structure: management account + OUs + member accounts + SCPs. You have one organization. |
| **Management account** | The payer/admin account (`biznomy`). It owns the organization, SCPs and account vending. |
| **OU (Organizational Unit)** | A policy folder inside the organization. `tenants` is an OU, **not** a tenant. |
| **Member account** | An AWS account inside the organization. Each vended tenant is one member account. |
| **Tenant** | The logical unit (project + environment) that maps to one member account. Current dev tenant = `digitalcompanion-dev`. |
| **Project** | The product name, `digitalcompanion`; environments are `dev`/`prod`. |
| **Vending control plane** | The API/scripts that create/tag/close member accounts. Not a tenant itself. |

So: **organization** is the container; **`tenants` is the OU**; **`digitalcompanion-dev` is the
tenant/member account** for the dev environment. Do not call the OU or the organization a tenant.

---

## 1. Identities — two different emails

| Identity | Purpose | Current value (local only) |
|---|---|---|
| **IAM Identity Center user** | Human login to the AWS access portal; assigned `TenantAdmin` in accounts | `<sso-username>` / `<admin-email>` — local ops record |
| **AWS account root email** | Unique email required to create the account; receives AWS account notices and is the root recovery identity | `<unique-account-email>` — local ops record |

The second email exists because AWS requires every account to have a **globally unique email**; the
same mailbox is reused via a Gmail plus-address. It is **not** an SSO user and is not used for daily
login. The SSO user is the one with `TenantAdmin`.

Do not create root access keys or use root for daily work. The tenant SCP explicitly denies root-user
actions.

---

## 2. Login to the tenant in the AWS UI

1. Open the AWS access portal URL from the local ops record.
2. Sign in as the Identity Center user from the local ops record.
3. Choose the **digitalcompanion-dev** account and **TenantAdmin**.
4. The console opens with AdministratorAccess, **minus** the SCP guardrails:
   - only `us-east-1` for regional services
   - no root-user actions
   - no IAM users/access keys
   - CloudTrail and organization-leave actions protected

You can browse every resource the role is allowed to see. The account is currently empty (no app
resources), apart from AWS defaults such as the default VPC.

Local CLI profiles:

```bash
aws sso login --profile dc-admin       # management account
aws sso login --profile dc-tenant-dev  # tenant account
aws sts get-caller-identity --profile dc-tenant-dev
```

---

## 3. What OU and SCP mean

- **OU (Organizational Unit)** — a folder/container inside AWS Organizations. Accounts are moved into
  it so policies apply to the whole group. Current OU: `tenants`.
- **SCP (Service Control Policy)** — a guardrail that defines the **maximum** permissions for
  principals in accounts under the OU/root. It does not grant permissions; IAM/SSO still grants them.
  Management account is not affected.
- Current `tenants` SCPs:
  - `dc-region-lock-us-east-1`
  - `dc-deny-root-user`
  - `dc-deny-iam-users`
  - `dc-protect-org-cloudtrail`

---

## 4. Create a new tenant (manual, current path)

Use the management profile (`dc-admin`) and a new unique email:

```bash
# 1. Create the account
aws organizations create-account --profile dc-admin \
  --email '<unique-email>' --account-name '<tenant-name>'
# capture CreateAccountStatus.Id

# 2. Wait until SUCCEEDED
aws organizations describe-create-account-status --profile dc-admin \
  --create-account-request-id '<request-id>'

# 3. Move under tenants, tag
aws organizations move-account --profile dc-admin \
  --account-id '<new-account-id>' --source-parent-id '<organization-root-id>' \
  --destination-parent-id '<tenants-ou-id>'
aws organizations tag-resource --profile dc-admin --resource-id '<new-account-id>' \
  --tags Key=project,Value=digitalcompanion Key=env,Value=dev Key=owner,Value=nikhil

# 4. Assign SSO TenantAdmin
aws sso-admin create-account-assignment --profile dc-admin --region us-east-1 \
  --instance-arn '<instance-arn>' --target-id '<new-account-id>' --target-type AWS_ACCOUNT \
  --permission-set-arn '<tenant-admin-permission-set-arn>' \
  --principal-type USER --principal-id '<identity-center-user-id>'

# 5. Budget
ACCOUNT_ID='<new-account-id>' ALERT_EMAIL='<alert-email>' BUDGET_USD=25 \
  bash devops/tenancy/scripts/setup-tenant-budget.sh
```

The internal create/close scripts and vending API are not built yet; this is the documented manual
path. The `tenants` OU ID, SSO instance ARN, permission set ARN and user ID are stored in the local ops
record, not this public repo.

---

## 5. Delete / close a tenant

AWS account closure is the only complete cleanup. `terraform destroy` removes app resources but the
account remains. From the **management** account:

```bash
aws organizations close-account --profile dc-admin --account-id '<tenant-account-id>'
aws organizations describe-account --profile dc-admin --account-id '<tenant-account-id>'
```

Facts:

- The account moves to `SUSPENDED`, then `CLOSED`; there is a **90-day recovery window**.
- The root email cannot be reused for a new account while the old account/closure is in effect; use a
  new unique email for a recreated tenant.
- Root credentials are not needed; `dc-admin` (TenantAdmin in management) can close the account.
- Do not run this against a tenant with real data without an export.
- There is **no one-command delete/recreate script or public API yet**; this is Phase 5.

## 6. Recreate

1. Close the old tenant (above) and wait until `CLOSED`.
2. Create a new account with a **new unique email**.
3. Move to `tenants`, tag, assign SSO, create the $25 budget.
4. Deploy the POC profile (after Terraform exists).

The application code and `DATABASE_URL` contract do not change between tenants.

---

## 7. Pending / next

- Build the internal create/close/recreate scripts and vending control plane.
- Add tenant baseline (CloudTrail/roles/logging).
- Add the cheap POC Terraform profile and deploy it into the tenant.
