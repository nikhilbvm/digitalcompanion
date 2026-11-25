# AWS tenancy / account vending

This folder is for the **account-vending platform** chosen on 2026-11-25. It is separate from the
Digital Companion app deployment, but lives in this repo until it earns its own private repository.

Plan: [docs/planning/03-aws-tenancy.md](../../docs/planning/03-aws-tenancy.md)

## Current state

- AWS CLI 2.34.64 and Terraform 1.17.2 installed locally.
- No AWS profile/SSO yet. IAM Identity Center is not enabled.
- First step is a one-time **console** enable (the `CreateInstance` API is rejected for organization
  management accounts), then the CloudShell script below creates the admin permission set/user.
- No account IDs, root credentials or secrets live in this public repo.

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
