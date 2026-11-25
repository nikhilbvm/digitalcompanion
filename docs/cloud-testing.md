# Cloud end-to-end testing prerequisites

Status: **not implemented yet.** The repo has CI, container builds and a manual GHCR publish, but no
Terraform, ECR/ECS deployment, RDS instance, S3/CloudFront web deployment or cloud deploy workflow.
This is the Part 2 path. Local E2E is in [testing-local.md](testing-local.md).

---

## 0. Deployment profile decision

**This AWS account is not eligible for free-tier allowances; every resource below is charged.**
Do not rely on $0 EC2/RDS or 12-month credits.

The initial cloud POC is deliberately **not** the production topology:

| Area | Initial POC (now) | Production (before real users) |
|---|---|---|
| API + agent | One EC2 `t4g.small`, Docker Compose, Caddy TLS | Separate ECS Fargate services behind an ALB |
| Database | Postgres container on that EC2, EBS volume | Amazon RDS PostgreSQL, Multi-AZ, managed backups |
| Network | Public subnet, security group 443/SSH only; no ALB/NAT | Private subnets, NAT, ALB, WAF |
| Web | S3 + CloudFront static export | Same, plus access controls/WAF |
| Auth | None (temporary, restricted) | Cognito/family auth, per-person authorization |
| Observability | Basic logs + manual checks | CloudWatch alarms/dashboards, audit trail |
| Approx. cost | **~$20–25/mo on-demand** | **~$90–150/mo** |

The POC profile is for a short-lived cloud E2E with synthetic data only. Migrating to production is a
Terraform/profile change plus `pg_dump`/`pg_restore`; the application code and `DATABASE_URL` contract
stay the same. Do not store real family data on the POC host.

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

## 8. Cost — corrected breakdown (us-east-1, 730 h/month)

The earlier **$80–150/month** estimate was for the **production-shaped** architecture (ALB + NAT + two
Fargate services + RDS). A **$20–25/month** dev stack is possible only with a lean topology or
free-tier/Spot credits. AWS on-demand prices below are from the current public pricing pages; API
usage (OpenRouter/Deepgram/LiveKit) is separate.

### A. Production-shaped dev stack (as designed)

| Item | Monthly |
|---|---:|
| 2 × Fargate x86 tasks, 0.25 vCPU / 0.5 GB | $18.02 |
| RDS `db.t4g.micro` single-AZ + 20 GB gp3 | $13.98 |
| ALB base ($0.0225/h) + ~1 LCU | ~$22.27 |
| NAT gateway ($0.045/h) + a little data | ~$35 |
| Secrets Manager (4 secrets) | $1.60 |
| ECR + S3/CloudFront + CloudWatch | ~$3 |
| **Total** | **~$92–95/mo** |

ARM Fargate saves ~$3.60/month; a larger agent task (0.5 vCPU/1 GB) adds ~$9/month. More traffic,
logs and NAT data move it toward the earlier $100–150 upper bound. **$20–25 is not achievable with
ALB + NAT + two Fargate tasks.**

### Do we need RDS for the first cloud test?

**Not necessarily.** RDS is the managed production database, but for a temporary cloud E2E the
Postgres container can run on the same EC2 dev host:

- `DATABASE_URL=postgres://...@127.0.0.1:5432/digitalcompanion`
- keep port 5432 bound to localhost/private network, never the public internet
- back up with EBS snapshots or `pg_dump` to S3
- when real family data/backups matter, migrate to RDS (`pg_dump`/`pg_restore`) and change
  `DATABASE_URL`; no application code changes

This removes ~$14/month and is the right first cloud step. The database is still required — it stores
people, conversations, messages, guardrail flags and (Part 2) memory notes; without it there is no
admin history, guardrail review, or voice profile load. It is not just preferences.

### B. Lean cloud dev (to hit ~$20–35)

One **EC2 `t4g.small`** in a public subnet running Docker Compose (API + agent) behind Caddy for TLS,
plus private RDS, S3/CloudFront web, and SSM/Secrets Manager:

| Item | On-demand | Notes |
|---|---:|---|
| EC2 `t4g.small` | $12.26 | Spot ≈ $5.84, interruption risk |
| 20 GB EBS gp3 | $1.60 | |
| Public IPv4 | $3.65 | |
| RDS `db.t4g.micro` + 20 GB gp3 | $13.98 | optional; this account is **not** free-tier eligible |
| Route 53 / S3 / CloudFront / secrets | ~$2–3 | |
| **Total with RDS** | **~$34 on-demand** | **~$27 Spot** |
| **Total without RDS** (Postgres in Docker on EC2) | **~$20 on-demand** | **~$13 Spot** |

Trade-offs: no ALB/NAT, one host, API and agent share CPU/memory, manual security patching, and only
the API is exposed (Caddy handles TLS). It is a good **temporary cloud E2E** profile, not the
production shape.

### C. Single Fargate task with two containers

One 0.5 vCPU / 1 GB task (API + agent containers) in a public subnet, no ALB/NAT, plus RDS and S3:

- ARM Fargate ≈ $14.42/month (x86 ≈ $18.02)
- Public IPv4 $3.65, RDS $13.98, misc ~$3 → **~$35–39 on-demand**
- With RDS free tier and Fargate Spot: **~$22–30**, but Spot interruptions and public-endpoint/TLS
  handling make it less predictable than the EC2 option.

### D. Free tier / credits

**Not applicable to this account.** The figures in this document assume all resources are charged
on demand. Fargate, NAT and ALB have no free tier regardless.

### Other notes

- Aurora Serverless v2 has a higher idle minimum than `db.t4g.micro`; use it only when needed.
- Stop/scale down the dev stack when not testing. RDS can be stopped temporarily, but it restarts
  automatically after 7 days.
- OpenRouter/Deepgram/LiveKit usage is billed separately and is small for POC testing, but not $0.

---

## 9. What is already true

- API/agent Docker images build and smoke-test in CI.
- Local E2E (`pnpm e2e`) passes 21/21 with a real LiveKit dispatch and voice greeting.
- The web is a static export ready for S3 + CloudFront.
- The database layer is RDS-compatible Postgres.
- CI has a Postgres schema/Store smoke test and a tracked-file secret scan.

The missing work is the AWS infrastructure and deploy workflow, plus auth/hardening before exposing
anything publicly. See [planning/02-part2-roadmap.md](planning/02-part2-roadmap.md).
