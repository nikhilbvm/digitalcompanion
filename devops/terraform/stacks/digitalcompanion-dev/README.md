# digitalcompanion-dev tenant stack

Phase 1 Terraform root for the first tenant. It uses the cheap POC profile from
[docs/planning/04-tenant-infrastructure.md](../../../../docs/planning/04-tenant-infrastructure.md):
one EC2 `t4g.small` with Docker Compose, an EBS data volume, per-tenant ECR, two CloudFront
distributions, SSM secrets/config, and GitHub OIDC roles.

**No apply has been run from this stack.** Phase 1 ends at a reviewed `terraform plan`.

## Prerequisites

- AWS CLI SSO profile `dc-tenant-dev` with a valid session.
- Terraform >= 1.10.
- The tenant backend bootstrap has been run:

```bash
PROFILE=dc-tenant-dev TENANT=digitalcompanion-dev \
  bash devops/tenancy/scripts/bootstrap-tenant-backend.sh
```

That creates the state bucket + DynamoDB lock table and writes the gitignored `backend.hcl`.

## Plan

```bash
cd devops/terraform/stacks/digitalcompanion-dev
AWS_PROFILE=dc-tenant-dev terraform init -backend-config=backend.hcl
AWS_PROFILE=dc-tenant-dev terraform plan -var-file=terraform.tfvars
```

`terraform.tfvars` is local/gitignored; start from `terraform.tfvars.example`. The defaults match the
current tenant, so `terraform plan` without a var file is also valid.

## What the plan contains

- VPC, public subnet, internet gateway, route table, and an app security group that allows port 4000
  only from CloudFront's origin-facing prefix list.
- EC2 `t4g.small`, Elastic IP, 20 GB gp3 data EBS, SSM-only access, Docker/Compose and CloudWatch
  agent bootstrap, 2 GB swap.
- ECR repositories for API and agent.
- Private artifacts bucket for deploy bundles and migration SQL.
- CloudFront API distribution (HTTPS viewer, HTTP origin on the EC2 public DNS:4000, SSE-safe
  settings) and web distribution (S3 OAC, directory-index rewrite).
- CloudWatch log groups and CPU/memory/swap/status alarms.
- GitHub OIDC provider and separate `gha-infra` / `gha-deploy` roles.

## Outputs

Use the outputs to populate the GitHub Environment `digitalcompanion-dev`:

`api_url`, `web_url`, `web_cloudfront_distribution_id`, `web_bucket`, `artifacts_bucket`,
`ecr_repository_urls`, `instance_id`, `github_infra_role_arn`, `github_deploy_role_arn`,
`ssm_parameter_path`.

Do not commit account IDs, AWS role ARNs, state bucket names or tfstate files.
