# Tenant audit — digitalcompanion-dev

Append-only human-readable record. CloudTrail, Terraform state and deploy tags are authoritative.
No account IDs, emails or secrets here.

## 2026-11-26 — Phase 1 implementation

- Built Terraform modules and the `digitalcompanion-dev` stack.
- Added the backend bootstrap script and local-only backend config.
- Added the tenant README/audit scaffold.
- Created the tenant Terraform state backend (S3 + DynamoDB); backend config is local-only.
- Ran `terraform plan`: 47 to add, 0 to change, 0 to destroy. No Terraform apply and no application
  resources created.
- Pending: review/approve the plan; Phase 2 apply.

## 2026-11-26 — Phase 2 infrastructure apply

- Applied the 47-resource Terraform stack after explicit approval of the VPC/network and IAM/OIDC
  scope.
- The first API CloudFront apply hit an AWS provider deferred-data-source bug; fixed by moving the
  managed cache/origin-request policy lookups to the stack root. A follow-up apply added only the API
  distribution and deploy policy.
- Final post-apply `terraform plan`: **no changes**. Terraform state serial: 5.
- Verified EC2 bootstrap via SSM: Docker running, `/data` mounted from the data EBS, 2 GB swap,
  CloudWatch agent active, SSM online. No SSH/key pair.
- Verified the app security group allows only TCP 4000 from CloudFront's origin-facing prefix list;
  web/artifact S3 buckets block all public access.
- API CloudFront currently returns 504 and the web URL 403 because no application containers or web
  files are deployed yet. Expected.
- CloudTrail tenant baseline, secrets, images and the first app deploy remain pending.

## 2026-11-26 — first application deployment

- Pushed the required provider keys and a generated Postgres password to tenant SSM SecureStrings.
- Built and pushed ARM64 API/agent images to tenant ECR, tag `v0.1.0-b0e0eeb`.
- Deployed through SSM: rendered `/opt/digitalcompanion/.env`, logged in to ECR, pulled images, ran
  `0001_init.sql`, and started Postgres, API and agent.
- API `/health` through CloudFront reports `llm`, `database`, `deepgram` and `livekit` configured.
  The agent registered with LiveKit as worker `dc`.
- Cloud E2E against the deployed API/Postgres passed **21/21**, including text chat, guardrails,
  masking, emergency handling, Deepgram TTS, LiveKit dispatch and a real voice greeting. Synthetic
  test rows were removed afterward.
- Postgres is bound to host loopback only for SSM maintenance/backups; the SG still permits only
  CloudFront to port 4000. The local dev stack was stopped to prevent its same-named LiveKit worker
  from receiving cloud dispatches.
- GitHub Environment `digitalcompanion-dev` variables were configured from outputs; values are kept
  locally in the gitignored `.secrets/` file.
- Static web deployment and CloudTrail remain pending. POC data is synthetic-only with no backups.

## 2026-11-26 — static web deployment

- Built the Next static export with the cloud API URL inlined and uploaded it to the private web S3
  bucket; CloudFront invalidation completed.
- Home and `/admin/` return 200, `/admin` rewrites correctly, and missing routes return 404.
- The API returns `Access-Control-Allow-Origin` for the exact web CloudFront origin.
- No web build environment contains `DATABASE_URL` or server secrets.
- CloudTrail remains the outstanding tenant-baseline item.

## 2026-11-26 — CloudTrail and CI workflows

- Enabled CloudTrail organization service access and created the multi-region organization trail
  `dc-org-trail` in the management account. It logs to a private, versioned, encrypted S3 bucket with
  log-file validation and 365-day lifecycle.
- CloudTrail reports `IsLogging: true`; the first delivery can lag.
- Added GitHub workflows for Terraform plan/apply, ARM64 image build, app deploy and web deploy.
  They use the `digitalcompanion-dev` Environment, OIDC roles and repository variables; no AWS keys
  or app secrets are stored in GitHub.
- Added the missing `ssm:DescribeInstanceInformation` permission to the deploy role and applied it.
- Terraform state serial: 6. First CI workflow run is pending.

## 2026-11-26 — CI verified

- First GitHub runs: CI, ARM64 image build, app deploy, web deploy, Terraform plan and Terraform
  apply all completed successfully. CI-built tag `v0.1.0-6a5d6a5` is deployed.
- Fixed the GitHub OIDC trust after GitHub began emitting immutable owner/repo IDs in the `sub`
  claim; both the immutable-ID and legacy subject forms are accepted.
- CloudTrail is delivering organization logs for the tenant; latest delivery succeeded.
- Terraform state serial: 7. No local dev stack is running (local `pnpm dev` now uses `dc-local`).
- Close/recreate rehearsal and production gates remain.

## 2026-11-26 — redesigned UI deployed

- CI built images for commit `604d197`; `deploy-app` deployed tag `v0.1.0-604d197` and `deploy-web`
  rebuilt the S3/CloudFront web.
- Cloud browser verification passed: new shell, settings, chat toggle and admin People view; no
  console errors.
- Cloud call test with a fake microphone transitioned Call → End call and back to Call; no error toast.
- `PUT /people/:id` returned 200 against the tenant using unchanged data.
- No Terraform changes; state serial remains 7. Local dev stack was stopped after verification.
- Close/recreate rehearsal and production hardening remain.

<!-- Template:
## YYYY-MM-DD — action
Actor:
Commit:
Terraform state serial:
Images:
Result:
-->
