# AWS tenancy log

Append-only record of AWS tenancy/account-vending work. No account IDs, root emails, credentials or
personal data in this public repo; keep those in the local ops record/password manager.

---

## 2026-11-25 — tooling and SSO foundation

- Installed AWS CLI 2.34.64 and Terraform 1.17.2 (Homebrew; Terraform from the HashiCorp tap).
- Enabled IAM Identity Center in `us-east-1` in the management account.
- Created `TenantAdmin` permission set with `AdministratorAccess` (bootstrap scope), an Identity
  Center user, and the management-account assignment.
- Created local SSO profiles `dc-admin` (management) and `dc-tenant-dev` (tenant); verified
  `aws sts get-caller-identity` for both.
- Created the `tenants` OU and attached four SCPs: region lock (`us-east-1`), root-user deny,
  IAM-user/access-key deny, and organization/CloudTrail protection.
- Created the first tenant account `digitalcompanion-dev`, moved it under `tenants`, tagged it
  `project=digitalcompanion env=dev owner=nikhil`, and assigned `TenantAdmin` via Identity Center.
- Created a **$25/month** cost budget with 50/80/100% ACTUAL alerts; SNS email subscription is
  pending confirmation.
- Verified guardrails: a `us-west-2` EC2 call and `iam:CreateUser` are denied by explicit SCPs.
- Confirmed the pre-existing `Project1` member account is **CLOSED/SUSPENDED** and was not reused.

## 2026-11-26 — documentation and clarification

- Added [devops/tenancy/RUNBOOK.md](../../devops/tenancy/RUNBOOK.md): identities (SSO user vs AWS
  account root email), UI login, OU/SCP meanings, manual create/close/recreate procedure and pending
  work.
- Documented that account deletion is via AWS Organizations `close-account` (90-day recovery; use a
  new unique email to recreate) and that no one-command tenant script/API exists yet.
- Confirmed the tenant is empty (no app resources, $0 spend) and the budget is active.
- Pending: SNS email confirmation; internal tenant lifecycle scripts/vending control plane; tenant
  baseline; cheap POC Terraform deployment.

## Pending actions

- [ ] Confirm the SNS budget-alert email subscription.
- [ ] Build internal `create/close/recreate tenant` scripts and the vending control plane.
- [ ] Add the tenant baseline (CloudTrail/roles/logging).
- [ ] Deploy the cheap POC Terraform profile into the tenant.
- [ ] Re-login SSO when the token expires (`aws sso login --profile dc-admin` / `dc-tenant-dev`).
