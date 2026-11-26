# AWS tenancy / account vending

This folder is for the **account-vending platform** chosen on 2026-11-25. It is separate from the
Digital Companion app deployment, but lives in this repo until it earns its own private repository.

Plan: [docs/planning/03-aws-tenancy.md](../../docs/planning/03-aws-tenancy.md)
Runbook: [RUNBOOK.md](RUNBOOK.md)
Dated log: [docs/history/aws-tenancy-log.md](../../docs/history/aws-tenancy-log.md)

## Current state (2026-11-25)

Applied:
- AWS CLI 2.34.64, Terraform 1.17.2; IAM Identity Center enabled in `us-east-1`.
- `TenantAdmin` permission set + SSO user; local profiles `dc-admin` (management) and
  `dc-tenant-dev` (tenant) authenticate successfully. No root credentials/keys.
- `tenants` OU with four guardrail SCPs: region lock (`us-east-1`), root-user deny, IAM-user/access-key
  deny, and organization/CloudTrail protection.
- First tenant account `digitalcompanion-dev`: active, tagged, moved under `tenants`, SSO
  `TenantAdmin` assigned, $25/month budget with 50/80/100% **direct email** alerts (no SNS).
- Guardrails tested: a `us-west-2` call and `iam:CreateUser` both fail with an explicit SCP deny.

Next:
- Build the internal `create/close/recreate tenant` scripts and the vending control plane.
- Deploy the cheap POC profile into the tenant.

No account IDs, root credentials, personal emails or secrets live in this public repo.

## Bootstrap SSO

1. In the management account console, enable **IAM Identity Center** (same region you will use, e.g.
   `us-east-1`).
2. Open **CloudShell** in that region and run:

```bash
curl -fsSL https://raw.githubusercontent.com/nikhilbvm/digitalcompanion/main/devops/tenancy/cloudshell/bootstrap-sso.sh -o bootstrap-sso.sh
REGION=us-east-1 \
ADMIN_EMAIL='you@example.com' \
ADMIN_USERNAME='nikhil-admin' \
bash bootstrap-sso.sh
```

3. The script creates/reuses the `TenantAdmin` permission set (AdministratorAccess for bootstrap),
   your Identity Center user, and the management-account assignment. It prints the SSO start URL and
   region.
4. Locally:

```bash
aws configure sso --profile dc-admin
aws sso login --profile dc-admin
aws sts get-caller-identity --profile dc-admin
```

Do not use root for this. Do not create root access keys. `TenantAdmin` should be narrowed once the
vending control plane has a dedicated role.

## Planned layout

```
devops/tenancy/
├── cloudshell/bootstrap-sso.sh   # one-time SSO bootstrap (this folder)
├── terraform/org/                # tenants OU, SCPs, tag policy (management account)
├── terraform/control-plane/      # vending API/Lambda/DynamoDB/Secrets
├── terraform/tenant-baseline/    # baseline StackSet (roles, budgets, logging)
├── lambda/vending/               # account create/close/idempotency
└── scripts/                      # create/close/recreate tenant helpers
```

Phase 1 is internal/admin vending. Public self-serve signup is deferred until auth, abuse controls and
billing mapping are designed.
