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

<!-- Template:
## YYYY-MM-DD — action
Actor:
Commit:
Terraform state serial:
Images:
Result:
-->
