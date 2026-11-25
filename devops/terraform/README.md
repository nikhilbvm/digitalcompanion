# Terraform (Part 2 placeholder)

No Terraform is written yet. This folder reserves the layout and records the plan so Part 2 can start
without re-deciding the deployment shape.

## Planned modules

```
terraform/
├── modules/
│   ├── network/        # VPC, private subnets, security groups
│   ├── ecr/            # repositories + lifecycle policy
│   ├── ecs-api/        # cluster, task definition, service, ALB/API Gateway
│   ├── ecs-agent/      # LiveKit worker task + service (no inbound)
│   ├── secrets/        # Secrets Manager entries
│   ├── observability/  # CloudWatch log groups, alarms, dashboard
│   └── iam/            # task roles, GitHub OIDC deploy role
└── environments/
    ├── dev/
    └── prod/
```

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
2. Run the database migration (Supabase CLI/psql) with a dedicated credential.
3. Update the ECS API service and wait for stability.
4. Update the ECS agent service.
5. Smoke test /health (ok + configured) through the load balancer.
6. Tag deploy/{env}/{component}/v{version}; record the release.
```

Rollback: deploy the previous image tag; migrations stay backward-compatible for one release.

## Before writing code

- Decide API runtime: ECS Fargate (default) vs Lambda + API Gateway.
- Decide web hosting: Vercel until Capacitor, then S3 + CloudFront.
- Confirm Supabase/LiveKit production projects and secret rotation policy.
- Read [docs/devops.md](../../docs/devops.md) and
  [docs/planning/02-part2-roadmap.md](../../docs/planning/02-part2-roadmap.md).
