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
- Created a **$25/month** cost budget with 50/80/100% ACTUAL alerts (initially via SNS).
- Verified guardrails: a `us-west-2` EC2 call and `iam:CreateUser` are denied by explicit SCPs.
- Confirmed the pre-existing `Project1` member account is **CLOSED/SUSPENDED** and was not reused.

## 2026-11-26 — documentation and clarification

- Added [devops/tenancy/RUNBOOK.md](../../devops/tenancy/RUNBOOK.md): identities (SSO user vs AWS
  account root email), UI login, OU/SCP meanings, manual create/close/recreate procedure and pending
  work.
- Documented that account deletion is via AWS Organizations `close-account` (90-day recovery; use a
  new unique email to recreate) and that no one-command tenant script/API exists yet.
- Confirmed the tenant is empty (no app resources, $0 spend) and the budget is active.
- Switched the budget to **direct EMAIL** subscribers at 50/80/100%; deleted the unused SNS topic.
  No confirmation email is needed.
- Drafted [docs/planning/04-tenant-infrastructure.md](../planning/04-tenant-infrastructure.md):
  cheap POC Terraform modules, per-tenant state/audit, SSM secrets, ECR/CloudFront/EC2, and the
  GitHub plan/apply/build/deploy workflows.
- Recorded the implementation decisions: CloudFront default API URL, per-tenant ECR, SSM
  SecureString, Postgres on EC2/EBS, **no POC backups (synthetic data only)**, `t4g.small` ARM64,
  separate `gha-infra`/`gha-deploy` OIDC roles, Git audit + CloudTrail, and manual deploys.
- Pending: Phase 1 backend bootstrap + Terraform modules + reviewed plan; internal tenant lifecycle
  scripts/vending control plane; tenant baseline; first cloud deploy.

## 2026-11-26 — Phase 1 Terraform and plan

- Added the tenant backend bootstrap script. It created a versioned/encrypted S3 state bucket with
  public access blocked, a DynamoDB lock table with PITR/deletion protection, and a local-only
  `backend.hcl`.
- Added eight POC Terraform modules (network, EC2 app, ECR, artifacts, CloudFront API, web static,
  GitHub OIDC, observability) and the `digitalcompanion-dev` stack.
- `terraform validate` passes; `terraform plan` reports **47 to add, 0 to change, 0 to destroy**.
- No Terraform apply and no application resources. POC remains synthetic-only and backup-free by
  decision.
- Pending: review/approve plan; Phase 2 apply; GitHub Environment; first app deploy.

## 2026-11-26 — Phase 2 infrastructure applied

- After explicit approval of the network/IAM scope, applied the stack. The first API CloudFront
  create hit an AWS provider deferred-data-source bug; moved the managed cache/origin-request policy
  lookups to the stack root, then applied the remaining API distribution and deploy policy.
- Final post-apply `terraform plan`: no changes. Terraform state serial: 5.
- Verified EC2 bootstrap through SSM: Docker, `/data` mount, 2 GB swap, CloudWatch agent and SSM
  online. Security group allows only CloudFront to port 4000; both S3 buckets block public access.
- API CloudFront is 504 and web is 403 until the first app/web deployment. CloudTrail, secrets and
  containers remain pending.

## 2026-11-26 — first app deployment and cloud E2E

- Pushed SSM secrets, built/pushed ARM64 images (`v0.1.0-b0e0eeb`), and deployed Postgres/API/agent
  via SSM. Migrations applied through the one-shot `migrate` service.
- API health through CloudFront is green for LLM, database, Deepgram and LiveKit; the voice worker
  registered as `dc`.
- Cloud E2E passed 21/21, including text guardrails/masking, emergency handling, Deepgram TTS,
  LiveKit dispatch and a real voice greeting. Temporary test rows were cleaned up.
- Stopped the local `pnpm dev` stack during the voice test because its same-named LiveKit worker was
  receiving cloud dispatches; it can be restarted for local work.
- Postgres is loopback-bound for SSM maintenance only. Static web and CloudTrail baseline are the
  remaining Phase 2/3 items.

## 2026-11-26 — static web deployed

- Built the static export with the cloud API base URL and uploaded it to the private S3 bucket;
  CloudFront invalidation completed.
- Home and admin return 200, trailing-slash routing and 404 behavior are correct, and the API CORS
  header matches the web CloudFront origin.
- No server secrets are present in the web build. CloudTrail baseline remains pending.

## Pending actions

- [x] Budget alerts use direct email; SNS topic deleted (no confirmation needed).
- [ ] Build internal `create/close/recreate tenant` scripts and the vending control plane.
- [ ] Add the tenant baseline (CloudTrail/roles/logging).
- [ ] Deploy the cheap POC Terraform profile into the tenant.
- [ ] Re-login SSO when the token expires (`aws sso login --profile dc-admin` / `dc-tenant-dev`).
