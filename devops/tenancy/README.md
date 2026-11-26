# AWS tenancy / account vending

This folder is for the **account-vending platform** chosen on 2026-11-25. It is separate from the
Digital Companion app deployment, but lives in this repo until it earns its own private repository.

Account-vending plan: [docs/planning/03-aws-tenancy.md](../../docs/planning/03-aws-tenancy.md)
Tenant app infrastructure + pipeline plan:
[docs/planning/04-tenant-infrastructure.md](../../docs/planning/04-tenant-infrastructure.md)
Model & user-facing explanation: [docs/tenancy-model.md](../../docs/tenancy-model.md)
Runbook: [RUNBOOK.md](RUNBOOK.md)
Dated log: [docs/history/aws-tenancy-log.md](../../docs/history/aws-tenancy-log.md)

## Current state (2026-11-26)

Applied:
- AWS CLI 2.34.64, Terraform 1.17.2; IAM Identity Center enabled in `us-east-1`.
- `TenantAdmin` permission set + SSO user; local profiles `dc-admin` (management) and
  `dc-tenant-dev` (tenant) authenticate successfully. No root credentials/keys.
- `tenants` OU with four guardrail SCPs: region lock (`us-east-1`), root-user deny, IAM-user/access-key
  deny, and organization/CloudTrail protection.
- First tenant account `digitalcompanion-dev`: active, tagged, moved under `tenants`, SSO
  `TenantAdmin` assigned, $25/month budget with 50/80/100% **direct email** alerts (no SNS).
- Guardrails tested: a `us-west-2` call and `iam:CreateUser` both fail with an explicit SCP deny.
- Phase 1 Terraform state backend created in the tenant (versioned/encrypted S3 + DynamoDB lock);
  `backend.hcl` is local-only.
- Terraform POC modules and the `digitalcompanion-dev` stack are applied: 47 resources, post-apply
  plan is empty. EC2 bootstrap is healthy (Docker, `/data`, swap, CloudWatch agent, SSM).
- Secrets are in SSM; ARM64 API/agent images are in ECR; Postgres, API and agent are deployed via
  SSM. Cloud E2E passed 21/21 including a dispatched voice greeting. GitHub Environment variables are
  configured.
- The static web build and CloudTrail baseline are not deployed yet.

Next:
- Deploy the static web build (Phase 3) and enable CloudTrail.
- Build the internal `create/close/recreate tenant` scripts and the vending control plane.
- Add the GitHub plan/build/deploy workflows (Phase 4).

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
