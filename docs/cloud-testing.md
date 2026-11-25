# Cloud end-to-end testing prerequisites

Status: **not implemented yet.** The repo has CI, container builds and a manual GHCR publish, but no
Terraform, ECR/ECS deployment, RDS instance, S3/CloudFront web deployment or cloud deploy workflow.
This is the Part 2 path. Local E2E is in [testing-local.md](testing-local.md).

---

## 1. Accounts and access

| Service | Needed for cloud E2E |
|---|---|
| **AWS** | An account/region for the dev stack (separate from any future prod account). IAM permissions to create VPC/NAT, RDS, ECR, ECS/Fargate, ALB, S3, CloudFront, Secrets Manager, CloudWatch, Route 53/ACM. |
| **OpenRouter** | A dedicated API key for this deployment (don't reuse the gcsealpha2 key). |
| **Deepgram** | A rotated key (the old one is revoked but remains in git history). |
| **LiveKit Cloud** | Project URL, API key, API secret; the worker dispatch name must be `dc`. |
| **DNS/TLS** | A domain or subdomain for the API and web, plus ACM certificates (CloudFront cert must be in `us-east-1`). |
| **Supabase** | Not needed — Postgres is Amazon RDS. |

No Anthropic key is required; direct Anthropic is optional fallback.

---

## 2. AWS resources (Terraform)

The planned modules are in [devops/terraform/README.md](../devops/terraform/README.md):

- **network** — VPC, two private subnets with NAT egress, public subnets for the ALB, security groups.
- **rds** — PostgreSQL 16/17 in private subnets, encryption at rest, backups, port 5432 from API/agent
  security groups only.
- **ecr** — repositories for `api` and `agent` images.
- **ecs-api** — Fargate service behind an ALB, `/health` target-group check, HTTPS listener.
- **ecs-agent** — Fargate worker with **outbound only** (LiveKit Cloud, OpenRouter, Deepgram, RDS).
  No load balancer or inbound listener.
- **secrets** — Secrets Manager entries and task-execution-role access.
- **web** — private S3 bucket, CloudFront distribution/OAC, index rewrite, cache rules.
- **observability** — CloudWatch log groups, alarms (5xx, task restarts, agent disconnects), dashboard.
- **iam** — task roles plus a GitHub OIDC deploy role (no long-lived AWS keys).
- **dns/acm** — optional Route 53 records and certificates.

Terraform state: S3 + DynamoDB lock, one state per environment.

---

## 3. Runtime configuration

### API service

```env
DATABASE_URL=postgres://...           # RDS, sslmode=require
DATABASE_SSL=true
DATABASE_SSL_CA=/etc/ssl/rds-ca.pem   # recommended
OPENROUTER_API_KEY=...
LLM_PROVIDER=openrouter
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
AGENT_NAME=dc
CORS_ORIGIN=https://<cloudfront-domain>
PORT=4000                             # or API_PORT
```

The API is the only public compute service. The ALB health check is `GET /health`; all
`configured` flags must be true for chat/voice.

### Agent service

```env
OPENROUTER_API_KEY=...
DEEPGRAM_API_KEY=...
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
AGENT_NAME=dc
DATABASE_URL=...
DATABASE_SSL=true
DATABASE_SSL_CA=/etc/ssl/rds-ca.pem
```

No inbound port. It must reach LiveKit Cloud, OpenRouter, Deepgram and RDS through the NAT gateway.

### Web (S3 + CloudFront)

Set at **build time**:

```env
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>
NEXT_PUBLIC_LIVEKIT_URL=wss://...
```

Build with `pnpm --filter @companion/web build`, sync `apps/web/out/` to S3, invalidate CloudFront.
The app uses `trailingSlash: true`; configure the origin/CloudFront Function so directory requests map
to `index.html` (S3 website endpoint or a CloudFront Function).

---

## 4. Database

1. Run `db/migrations/0001_init.sql` against RDS before the new API task set becomes active.
2. Use a dedicated migration credential/job; do not run migrations from every task.
3. Verify `select count(*) from people;` and the seed/demo person if desired.
4. Backups and deletion protection on for anything beyond a throwaway dev stack.

---

## 5. GitHub / deployment

Not built yet. Required when it is:

- GitHub Environments `dev` (no gate) and `prod` (required reviewer).
- OIDC role trust for this repo/environment; secrets in AWS Secrets Manager.
- Build → push immutable images to ECR (not GHCR) → deploy ECS services by image tag.
- Run migration job → update API → update agent → S3 sync/CloudFront invalidation.
- Smoke test `/health` through the ALB and one text chat before declaring success.
- Deploy tags `deploy/{env}/{component}/v{version}` and rollback by redeploying the previous tag.

Until this exists, cloud testing means manual `terraform apply`, `aws ecs update-service`, and
`aws s3 sync` from a workstation.

---

## 6. Security before any public test

The POC has **no authentication**. A cloud test must be isolated:

- Use a dedicated dev AWS account, synthetic people only, and no real care notes.
- Restrict access: WAF/IP allowlist, ALB OIDC/Cognito auth, or a private VPC endpoint. Do not put
  `/admin` on the open internet.
- Service-role/database credentials in Secrets Manager only; never in the web build.
- Rotate the OpenRouter/Deepgram/LiveKit keys; never commit them.
- Keep `/admin` disabled or behind auth before sharing any URL.

---

## 7. Cloud acceptance test

After a deploy:

1. `GET https://<api-domain>/health` → `ok:true`, all configured flags true.
2. Create a synthetic person via `/admin`.
3. Text chat streams a reply; guardrail card/fall cases behave; DB shows masked values/flags.
4. Voice: browser on **HTTPS** (mic requires a secure context), allow mic, hear the greeting, check
   live transcript, interrupt, End.
5. Admin shows the conversation with masked messages and flags.
6. CloudWatch has no error spikes; agent log shows `registered worker` with `agentName: "dc"` and a
   job for the room.
7. RDS contains no raw card/SSN/OTP digits.

The local `pnpm e2e` script needs direct Postgres access; for cloud, either run it from a VPN/bastion
with RDS access or add a cloud-only API-level E2E variant.

---

## 8. Rough cost (dev, always-on)

Expect roughly **$80–150/month** in `us-east-1` for one small dev stack:

- NAT gateway + data
- ALB
- two small Fargate tasks (API + agent)
- RDS `db.t4g.micro`/small
- Secrets Manager, CloudWatch, S3/CloudFront (pennies at POC traffic)

Stop or scale down tasks when not testing. Aurora Serverless v2 costs more at idle minimums.

---

## 9. What is already true

- API/agent Docker images build and smoke-test in CI.
- Local E2E (`pnpm e2e`) passes 21/21 with a real LiveKit dispatch and voice greeting.
- The web is a static export ready for S3 + CloudFront.
- The database layer is RDS-compatible Postgres.
- CI has a Postgres schema/Store smoke test and a tracked-file secret scan.

The missing work is the AWS infrastructure and deploy workflow, plus auth/hardening before exposing
anything publicly. See [planning/02-part2-roadmap.md](planning/02-part2-roadmap.md).
