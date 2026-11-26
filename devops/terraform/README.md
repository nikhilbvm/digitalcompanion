# Terraform

The **active POC** is implemented in this folder: EC2 + Docker Compose + EBS Postgres,
S3/CloudFront web, SSM secrets, per-tenant state and audit. See
[docs/planning/04-tenant-infrastructure.md](../../docs/planning/04-tenant-infrastructure.md) and the
tenant stack at [stacks/digitalcompanion-dev](stacks/digitalcompanion-dev/README.md).

Phase 2 status: the state backend and **47 tenant resources are applied**; the post-apply plan is
empty. API, voice agent and Postgres are deployed; the static web build and CloudTrail baseline are
not deployed yet.

The module layout below is the **production** shape (ECS/RDS/ALB), kept for the later migration. Do
not treat it as the first implementation.

## Implemented POC modules

```
terraform/
├── modules/
│   ├── network-minimal/   # VPC, public subnet, CloudFront-only API SG
│   ├── ec2-app/           # EC2/EIP/EBS, IAM, Docker/Compose bootstrap
│   ├── ecr/               # api/agent repositories
│   ├── s3-artifacts/      # deploy bundles/migrations
│   ├── cloudfront-api/    # HTTPS API distribution
│   ├── web-static/        # S3 + CloudFront OAC + index rewrite
│   ├── github-oidc/       # separate infra/deploy roles
│   └── observability/     # log groups + alarms
└── stacks/
    └── digitalcompanion-dev/
```

## Planned production modules

```
terraform/
├── modules/
│   ├── network/        # VPC, private subnets, NAT egress, security groups
│   ├── ecr/            # repositories + lifecycle policy
│   ├── ecs-api/        # cluster, task definition, service, ALB/API Gateway
│   ├── ecs-agent/      # LiveKit worker task + service (no inbound)
│   ├── rds/            # PostgreSQL, subnet group, security group, backups
│   ├── web/            # S3 bucket, CloudFront, index rewrite, invalidation
│   ├── secrets/        # Secrets Manager entries
│   ├── observability/  # CloudWatch log groups, alarms, dashboard
│   └── iam/            # task roles, GitHub OIDC deploy role
└── environments/
    ├── dev/
    └── prod/
```

## Runtime notes

- The API and agent run in private subnets and need outbound access (NAT gateway) to Anthropic,
  Deepgram, LiveKit Cloud and RDS. Only the API sits behind the ALB; the agent has no inbound
  listener.
- API target group health check: `GET /health` (expect 200 and `configured` true for required
  services). The agent has no HTTP health endpoint; alarm on ECS task restarts, LiveKit worker
  disconnects and error logs.
- The web bucket is private; CloudFront accesses it via OAC (or use the S3 website endpoint when a
  directory-index rewrite is simpler). Add a CloudFront Function if using an OAC + REST origin.
- Store `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY` for direct), `DEEPGRAM_API_KEY`, `LIVEKIT_*` and
  `DATABASE_URL` in Secrets Manager
  and inject them through the task execution role. RDS is reachable only from the app security group.

## State

- Remote backend: S3 bucket + DynamoDB lock table, one state per environment.
- No state in git. Bucket versioning and encryption enabled.
- `terraform plan` in CI is read-only; `apply` only from the deploy job with the environment gate.

## Authentication

- GitHub Actions assumes an AWS role via OIDC (`token.actions.githubusercontent.com`), scoped to the
  repository, branch/tag and environment. No long-lived AWS keys.
- Task roles are least-privilege. The agent has no public ingress.

## Deployment outline

```
1. Build immutable images (api, agent) and push to ECR.
2. Run the database migration (psql against RDS) with a dedicated credential.
3. Update the ECS API service and wait for stability.
4. Update the ECS agent service.
5. Build the web static export and `aws s3 sync` it to the bucket; invalidate CloudFront.
6. Smoke test /health (ok + configured) through the load balancer.
7. Tag deploy/{env}/{component}/v{version}; record the release.
```

Rollback: deploy the previous image tag; migrations stay backward-compatible for one release.

## Before writing code

- Decide API runtime: ECS Fargate (default) vs Lambda + API Gateway.
- Web hosting: S3 + CloudFront static export (decided); add an S3/CloudFront module.
- Confirm RDS/LiveKit production resources and secret rotation policy.
- Read [docs/devops.md](../../docs/devops.md) and
  [docs/planning/02-part2-roadmap.md](../../docs/planning/02-part2-roadmap.md).
