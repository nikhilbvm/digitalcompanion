# AWS tenancy setup plan

Status: **chosen — full account-vending platform; CLI + SSO; cheap POC first** · Date: 2026-11-25

Decisions (2026-11-25):
- Build the full internal account-vending platform, not just a single manual account.
- Authenticate with AWS CLI + IAM Identity Center/SSO; no root credentials, no Playwright for IAM.
- The first app deployment in a tenant uses the cheap POC profile (single EC2 + Docker Postgres/API/
  agent + Caddy, S3/CloudFront), not the production-shaped ECS/ALB/RDS stack.

**Phase 1 is an internal/admin vending control plane + CLI. Public self-serve signup is deferred until
auth, abuse controls and billing mapping are designed.**

> The repository is public. This document intentionally contains **no account IDs, root email
> addresses, credentials or tenant identifiers**. Use the placeholders locally; never commit values.

---

## 1. What “tenant” means here

Three different things are easy to conflate:

| Option | What it is | Fit for Digital Companion |
|---|---|---|
| **A. One dedicated AWS account** | A member account such as `digitalcompanion-dev` under the existing organization, with its own budget, SCPs and resources. One app, one account. | **Recommended for the POC.** Simple, isolated, cheap (~$20–25/month lean profile). |
| **B. App-level multi-tenancy** | One AWS account, many families as rows in Postgres (`people`) with auth/permissions in the app. | **Recommended for production** unless a hard regulatory boundary requires account-per-family. |
| **C. Account-vending platform** | Users sign up; a control plane creates a new AWS account per tenant, assigns Identity Center access, budgets, StackSets. | **Separate product/platform**, not needed for the Digital Companion POC. |

The pasted notes describe **Option C**. That is a security-critical platform in its own right
(Organizations, Identity Center, vending API, budgets, account closure); it should be a separate
repository/project, not part of the Digital Companion app. If the goal is simply to get this app into
AWS, choose **A now, B before real users**.

---

## 2. Authentication and the Playwright question

**Recommendation: AWS CLI + Terraform with short-lived credentials, not Playwright.**

- Use an IAM Identity Center permission set or a dedicated deployment role assumed with MFA.
- Terraform uses the AWS profile; no access keys in files or chat.
- **Never create or share root access keys.** Root is only for account recovery/billing tasks and
  should have MFA.
- **Do not automate AWS account/IAM creation through the console with Playwright.** The console is not
  an API: MFA, CAPTCHA, UI changes and a reused browser session make it brittle and hard to audit.
  Playwright is acceptable only for a human-in-the-loop console check or a one-off guided setup, not
  for the repeatable provisioning path.
- Account creation/closure and IAM are done with AWS Organizations/IAM APIs via the CLI or Terraform.

This machine currently has **no AWS CLI, Terraform or Playwright package installed**. Install the
first two first:

```bash
brew install awscli terraform
aws --version
terraform version
```

---

## 3. Recommended single-account target (Option A)

```text
AWS Organization (existing)
└── OU: tenants (new)
    └── Account: digitalcompanion-dev (new)
        ├── SCPs: region lock, deny root-user actions, guardrails
        ├── Budget: monthly cap + alerts (no hard AWS cap)
        ├── IAM Identity Center permission set or deployment role
        ├── Terraform state: S3 + DynamoDB lock
        ├── POC stack: EC2 + Docker Postgres/API/agent/Caddy
        └── S3 + CloudFront web
```

### Step-by-step

1. **Verify current organization state** (read-only, management account credentials):
   `aws organizations describe-organization`, list roots/OUs/accounts/policies. Confirm the existing
   region-lock SCP and whether `Project1` is in use.
2. **Create/choose the OU** `tenants` (or `digitalcompanion`) and attach guardrail SCPs so every new
   account inherits them:
   - deny all regions except the approved one(s);
   - deny root-user actions (except the break-glass path);
   - optionally deny public S3/RDS, require tags, protect CloudTrail.
3. **Create a dedicated member account** `digitalcompanion-dev` with a unique email. AWS creates the
   `OrganizationAccountAccessRole` for management-account access.
4. **Move the account** into the OU; tag it `project=digitalcompanion`, `env=dev`, `owner=<you>`,
   `cost-center=...`. Enable tag policies if desired.
5. **Create a budget** (e.g. $25/month) with alerts at 50/80/100% and an optional action that stops
   the EC2 instance or denies further spend. AWS has no true hard cap; monitor and enforce.
6. **Set up authentication for Terraform**:
   - preferred: Identity Center user + `DigitalCompanionAdmin` permission set, `aws configure sso`;
   - or: a deployment role trusted by your existing admin identity, assumed with MFA.
   - Do not create an IAM user access key unless there is no alternative; if you must, scope it,
     rotate it, and store it in a secret manager.
7. **Bootstrap Terraform backend**: S3 bucket (versioned, encrypted) + DynamoDB lock table in the
   new account.
8. **Add Terraform profile `dev`** for the POC (single EC2 + Docker Postgres/API/agent + Caddy, S3 +
   CloudFront; no RDS/ALB/NAT). See [cloud-testing.md](../cloud-testing.md).
9. **Add a teardown script**:
   - `poc-destroy.sh`: `terraform destroy` for app resources + cleanup of ECR/S3/CloudWatch;
   - `tenant-close.sh`: `organizations close-account` from the management account, using a
     non-root admin role. Account closure has a 90-day recovery window; the account ID/email cannot
     be reused immediately.
   - `tenant-recreate.sh`: create a new member account with a new email, re-apply OU/SCPs/tags/budget,
     bootstrap backend, deploy.
10. **Add CloudTrail/org trail and budget alerts** before any real data.

### What root is actually needed for

Very little: creating the organization (already done), changing root email/payment, and account
recovery. **Daily provisioning and teardown do not need root.** Use management-account
organizations permissions and member-account roles. If root is needed later, use the console manually
with MFA; do not store root credentials in this repo or give them to an agent.

---

## 4. Option C — account-vending platform (only if explicitly chosen)

If you really want “user signs up → new AWS account → admin access → budget → API vends it”, that is a
separate build. Minimum components:

- `tenants` OU + guardrail SCPs (region, root, public-resource restrictions).
- IAM Identity Center organization instance + `TenantAdmin` permission set.
- Vending control plane: API Gateway + Lambda, API key/JWT in Secrets Manager, idempotency table.
- `organizations create-account` → wait for `SUCCEEDED` → tag → move under OU → create SSO
  user/assignment → deploy baseline StackSet → create budget.
- Per-tenant budget + optional budget action; no true hard cap.
- Teardown via `organizations close-account` (90-day recovery); cross-account access through
  `OrganizationAccountAccessRole` (root cannot assume roles).
- Audit, abuse prevention, rate limits, ownership/billing mapping, and support process.

Hard limits: no real-time hard spend cap; SCP tag enforcement is partial; account close is the only
complete cleanup; account creation is asynchronous and rate-limited. This is a multi-week,
security-critical platform, not a POC step.

---

## 5. Chosen build phases

| Phase | Deliverable | Gate |
|---|---|---|
| 0. Bootstrap | CLI/Terraform installed; Identity Center enabled; SSO profile works; read-only org discovery | SSO login succeeds |
| 1. Org guardrails | `tenants` OU, region/root SCPs, tag policy, budget guardrails | Policies attached and verified |
| 2. Internal vending | Admin API/CLI to create account → wait → tag → move to OU → assign SSO → deploy baseline → budget → close; idempotency + audit | Create and close a throwaway tenant |
| 3. Tenant baseline + app | Baseline StackSet; Digital Companion cheap POC Terraform profile in `digitalcompanion-dev` | App E2E passes in the tenant |
| 4. Public vending | Signup/auth, API keys, rate limits, abuse/fraud controls, ownership/billing mapping | Security review |
| 5. Teardown/recreate | Scripts/API for close (90-day recovery), stack destroy, recreate with new email | Rehearsed in a throwaway tenant |

Tools installed on this machine: AWS CLI 2.34.64 and Terraform 1.17.2.

## 6. Immediate bootstrap (console step, then SSO)

Identity Center is not enabled, so SSO cannot be configured yet. In the AWS console **as the
management-account biznomy admin**:

1. Confirm you are in the management account and the intended region (e.g. `us-east-1`).
2. Open **IAM Identity Center** → **Enable**. It uses the existing organization.
3. Create a user for yourself (email) and a permission set **`TenantAdmin`** with
   `AdministratorAccess` (or a narrower initial set).
4. Assign the user to the management account (and later to tenant accounts).
5. Copy the **AWS access portal URL** and note the SSO region.

Then, locally:

```bash
aws configure sso --profile dc-admin
# paste the AWS access portal URL and SSO region
# choose the management account and TenantAdmin role
aws sso login --profile dc-admin
aws sts get-caller-identity --profile dc-admin
```

Do not create root access keys. If the biznomy user cannot enable Identity Center, use an existing
management-account admin role or the console root login once (with MFA) for this bootstrap only.

## 7. Open decisions

1. Scope: **single dedicated account** (recommended) vs account-vending platform vs only app-level
   multi-tenancy.
2. New account `digitalcompanion-dev` vs reusing the existing `Project1` account.
3. Authentication: Identity Center/SSO (recommended) vs a dedicated assume-role vs an IAM user key.
4. Budget amount and whether a budget action should stop resources automatically.
5. Region lock target (the existing `us-east-1` SCP?) and break-glass root policy.
6. Whether CloudTrail/GuardDuty/Security Hub are in scope now or Part 2.

Once these are answered, the execution is CLI/Terraform, not Playwright.
