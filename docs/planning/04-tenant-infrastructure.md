# Tenant infrastructure and deployment plan

Status: **proposed** · Date: 2026-11-26

Goal: provision and update the Digital Companion resources inside a tenant AWS account from code,
with one-command local bootstrap and repeatable GitHub build/deploy pipelines, while keeping a dated
per-tenant audit.

This builds on:
- [03-aws-tenancy.md](03-aws-tenancy.md) — organization, SSO, OU/SCPs, tenant lifecycle
- [tenancy-model.md](../tenancy-model.md) — one org, many tenants
- [cloud-testing.md](../cloud-testing.md) — cheap POC vs production-shaped profiles

---

## 1. Scope and principles

### In scope

- Terraform for the **cheap POC profile** inside a tenant account: one EC2 app host, Postgres on an
  EBS data volume, API/agent containers, S3 + CloudFront web, ECR, SSM secrets, GitHub OIDC.
- Idempotent `terraform plan/apply` for requirement changes.
- A separate app-deploy path for code changes (build images → push ECR → SSM deploy), so routine
  releases do not require Terraform.
- Per-tenant Terraform state, tags, deploy records and a dated audit file.
- GitHub Actions for infra plan/apply and app/web deploys.

### Out of scope for this phase

- RDS/ALB/NAT/ECS production shape (kept as the production migration path).
- Public self-serve tenant signup (Phase 4 of the vending platform).
- Multi-region, HA, autoscaling, WAF.
- Custom domain/ACM initially (optional later).

### Principles

1. **Terraform owns infrastructure; GitHub owns application releases.** Do not apply Terraform on
   every app deploy.
2. **One state per tenant.** No shared state across tenants, no workspaces for isolation.
3. **No secrets in Git or Terraform state.** Secrets go to SSM Parameter Store SecureString; Terraform
   manages names/references, not values.
4. **No account IDs or emails in this public repo.** Tenant account IDs, role ARNs and bucket names
   live in GitHub Environment variables and the local ops record.
5. **Least privilege.** Separate GitHub OIDC roles for infra and app deploy; no static AWS keys.
6. **SSM-only host access.** No SSH port; use Session Manager/Run Command.
7. **Audit by default.** Every apply/deploy appends date, actor, commit, image tag, state serial and
   workflow run; CloudTrail is the authoritative log.
8. **No Playwright for infrastructure.** Browser automation is not an IaC tool.

---

## 2. Target architecture (cheap POC tenant)

```
Internet
  ├── CloudFront (web) ──► private S3 bucket (static Next export)
  └── CloudFront (api) ──► EC2 public DNS :4000 (HTTP origin, EIP-backed;
                              SG allows only CloudFront origin-facing prefix list)
                                    │
                         EC2 t4g.small (AL2023 ARM64)
                         ├── Docker Compose
                         │   ├── api
                         │   ├── agent (LiveKit worker, outbound only)
                         │   └── postgres (data on /data EBS)
                         ├── SSM Agent (no SSH)
                         └── CloudWatch agent
                              │
                              ├── SSM Parameter Store SecureString (secrets)
                              ├── ECR (api/agent images)
                              ├── S3 (deploy bundles, pg_dump backups)
                              └── DLM EBS snapshots
```

- TLS: CloudFront default domain for both web and API. No custom domain needed for the POC. Optional
  Caddy + custom domain is a later variant.
- CloudFront requires a DNS name for a custom origin, not a raw IP. Use the EC2 public DNS name
  (`ec2-<public-ip>.compute-1.amazonaws.com`), which resolves to the associated Elastic IP; the EIP
  keeps it stable. Terraform owns both so a changed address updates the origin.
- LiveKit Cloud/OpenRouter/Deepgram are external; the agent needs outbound access only.
- API CORS allows the web CloudFront domain; web builds against the API CloudFront URL.
- CloudFront API behavior: caching disabled, all headers/query strings forwarded, compression **off**
  so SSE is not buffered, origin read timeout 60s. If a reply can exceed 60s, add a heartbeat or move
  the API behind ALB/Caddy later.
- EC2 SG: TCP 4000 from the CloudFront origin-facing managed prefix list only; no 22; optional
  Session Manager.

---

## 3. Repository layout

```
devops/
├── terraform/
│   ├── modules/
│   │   ├── network-minimal/     # VPC, public subnet, route table, SG
│   │   ├── ec2-app/             # EC2, EIP, data EBS, IAM role/profile,
│   │   │                        #   user data, SSM/CloudWatch
│   │   ├── ecr/                 # api/agent repositories + lifecycle
│   │   ├── s3-artifacts/        # deploy bundles, migrations, pg_dump backups
│   │   ├── cloudfront-api/      # HTTPS API distribution to EC2 public DNS:4000
│   │   ├── web-static/          # S3 + CloudFront OAC + bucket policy
│   │   ├── github-oidc/         # OIDC provider + deploy roles
│   │   └── observability/       # log groups, alarms, DLM snapshots
│   ├── stacks/
│   │   └── digitalcompanion-dev/  # one root per tenant
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       ├── outputs.tf
│   │       ├── versions.tf
│   │       ├── backend.hcl.example
│   │       └── terraform.tfvars.example
│   └── bootstrap/
│       └── backend/             # state bucket + lock table creation notes
├── tenancy/
│   ├── tenants/
│   │   └── digitalcompanion-dev/
│   │       ├── README.md        # tenant facts (no account ID/email)
│   │       └── AUDIT.md         # dated infra/deploy audit
│   ├── scripts/
│   │   ├── bootstrap-tenant-backend.sh
│   │   ├── push-tenant-secrets.sh
│   │   ├── deploy-tenant-app.sh
│   │   └── setup-tenant-budget.sh
│   └── ...
deploy/
└── tenant/
    ├── docker-compose.yml       # api, agent, postgres, migrate
    ├── .env.template            # rendered from SSM at boot/deploy
    └── systemd/                 # dc.service, env renderer
.github/workflows/
    ├── terraform-plan.yml
    ├── terraform-apply.yml
    ├── build-images.yml
    ├── deploy-app.yml
    └── deploy-web.yml
```

The tenant-specific `backend.hcl`, `terraform.tfvars` values containing account IDs, and `.env` are
local/CI-only and gitignored. Public examples use placeholders.

---

## 4. Terraform state and bootstrap

One-time per tenant, run locally with the `dc-tenant-dev` SSO profile:

```bash
devops/tenancy/scripts/bootstrap-tenant-backend.sh
```

Creates in the tenant account:
- S3 bucket `dc-tfstate-<account-id>`: versioning, SSE, block public, access logging optional.
- DynamoDB `dc-tfstate-lock` with `LockID`.
- Tags `project`, `env`, `tenant`, `managed-by`.

Then:

```bash
cd devops/terraform/stacks/digitalcompanion-dev
terraform init -backend-config=backend.hcl
terraform plan -var-file=terraform.tfvars
terraform apply
```

State key: `digitalcompanion/<tenant>/terraform.tfstate`. `prevent_destroy` on the data EBS and ECR
repos; the bootstrap script refuses to delete the state bucket or lock table. `terraform plan` must
be empty on an unchanged stack.

The bootstrap script is idempotent and does not store secrets.

### Adding another tenant

1. Create the account/OU/SSO/budget through the vending control plane (or the manual runbook).
2. Run `bootstrap-tenant-backend.sh` with that tenant's SSO profile.
3. Add a thin stack root for the tenant (or render one from the same template) and a GitHub
   Environment; init with its own backend key, plan, apply.
4. Keep modules shared. The later vending control plane renders the stack root, backend config,
   GitHub environment and audit files; it does not share state across tenants.

Do not use Terraform workspaces for tenant isolation: a workspace typo can target the wrong state.

---

## 5. Terraform modules

### `network-minimal`
- VPC + one public subnet (POC only), route table/internet gateway.
- SG for EC2: ingress 4000 from the CloudFront origin-facing managed prefix list; no SSH. (A later
  Caddy/custom-domain variant would add 443.)
- CloudFront prefix list looked up with a data source in `us-east-1`.

### `ec2-app`
- Amazon Linux 2023 ARM64 `t4g.small`; EIP; 20 GB gp3 root + 20 GB gp3 data EBS at `/data`.
- IAM instance role: ECR pull, SSM core + parameter read for `/digitalcompanion/<tenant>/*`, CloudWatch
  logs/metrics, S3 deploy bundle read.
- User data: install Docker/Compose/CloudWatch agent, format/mount `/data`, install systemd unit,
  render env from SSM, `docker compose up -d`.
- SSM Session Manager only; no key pair.
- `prevent_destroy` on data volume.

### `ecr`
- `digitalcompanion-api` and `digitalcompanion-agent` repos; scan on push; lifecycle retains last N
  images; immutable tags recommended.

### `s3-artifacts`
- Private, versioned, SSE bucket for deploy bundles, migration SQL and `pg_dump` backups.
- Instance role reads; `gha-deploy` writes; lifecycle expires old bundles/backups.

### `cloudfront-api`
- Origin `http://<EC2-public-dns>:4000` (DNS name required by CloudFront; EIP-backed), origin read
  timeout 60s, caching disabled, all headers/query strings, allowed methods, compression off.
- Default CloudFront domain output; optional WAF/custom domain later.
- This is the public HTTPS endpoint for the web app; SSE works through it.

### `web-static`
- Private S3 bucket; CloudFront OAC; default root object `index.html`; 404 → `/404.html`.
- `trailingSlash` export mapping via CloudFront Function or S3 website origin.
- Hashed assets long cache; HTML no-cache/short TTL.

### `github-oidc`
- One OIDC provider in the tenant.
- `gha-infra` role: Terraform state bucket/table + resource apply (scoped as tightly as practical).
- `gha-deploy` role: ECR push, S3 sync, CloudFront invalidation, SSM SendCommand, EC2 describe,
  SSM parameter read.
- Trust conditions: this repo, allowed branches/tags, GitHub Environment name (`digitalcompanion-dev`).
- No access keys.

### `observability`
- CloudWatch log groups for API/agent (and CloudFront logs if enabled).
- Alarms: instance status, CPU, disk, API 5xx/health, agent log errors; SNS/email (direct email)
  optional.
- DLM snapshot schedule for the data EBS; retention 7–14 days.
- Budget stays in the tenancy layer (already $25 direct email).

---

## 6. Secrets and runtime configuration

Terraform creates no secret values. Names are fixed per tenant:

```
/digitalcompanion/<tenant>/OPENROUTER_API_KEY
/digitalcompanion/<tenant>/DEEPGRAM_API_KEY
/digitalcompanion/<tenant>/LIVEKIT_URL
/digitalcompanion/<tenant>/LIVEKIT_API_KEY
/digitalcompanion/<tenant>/LIVEKIT_API_SECRET
/digitalcompanion/<tenant>/POSTGRES_PASSWORD
/digitalcompanion/<tenant>/DATABASE_URL     # optional; can be assembled on host
```

Non-secret config parameters (Terraform or the deploy script; no sensitive values):

```
/digitalcompanion/<tenant>/config/API_IMAGE_TAG
/digitalcompanion/<tenant>/config/AGENT_IMAGE_TAG
/digitalcompanion/<tenant>/config/CORS_ORIGIN
```

`push-tenant-secrets.sh`:
- reads local `.env`/secure input, assumes the tenant deploy role;
- writes SecureString parameters using the default SSM KMS key (a CMK is optional);
- never prints values, never writes them to Terraform state;
- updates one parameter at a time, idempotent.

At boot/deploy, the host renders `/opt/digitalcompanion/.env` (mode 600) from SSM and writes only what
the containers need. `POSTGRES_PASSWORD` is also set for the Postgres container; `DATABASE_URL` points
at `postgres://...@postgres:5432/digitalcompanion` inside the compose network.

Secrets rotation is a script + service restart; no Terraform apply.

---

## 7. Deployment flows

### A. Infrastructure change (requirements change)

1. Edit Terraform module/stack or non-secret tfvars.
2. PR → `terraform-plan.yml` (fmt/validate/tflint + plan) with the `gha-infra` role. Fork PRs do not
   get AWS credentials; the job is skipped unless the PR is from this repository.
3. Manual `terraform-apply.yml` on `main` with environment approval. It checks out the approved
   commit, runs a fresh plan, then applies that plan; state serial is recorded in `AUDIT.md`.
4. Smoke test and audit entry.

### B. Application image release

1. Push/merge to main or manual dispatch.
2. `build-images.yml`: build API/agent images for `linux/arm64` (the `t4g` host) with buildx,
   tag with git SHA + version, push to tenant ECR, optionally GitHub Release.
3. `deploy-app.yml` (manual, environment):
   - Write the image tags to `/digitalcompanion/<tenant>/config/` in SSM.
   - SSM SendCommand on the EC2 host: update image tags, `docker compose pull api agent`, run the
     `migrate` service, `docker compose up -d`.
   - Wait for health through the API CloudFront URL.
   - Roll back by redeploying the previous image tag.
4. Record image tags and workflow run in `AUDIT.md`; create a deploy git tag.

### C. Web release

1. `deploy-web.yml`: build with tenant `NEXT_PUBLIC_*`, sync `apps/web/out/` to S3, invalidate
   CloudFront.
2. Smoke the web and an API text chat.
3. Audit entry.

### D. Database migration

- Migrations are in `db/migrations/`, uploaded to the tenant deploy-bundle S3 bucket or baked into a
  migration image.
- Run as a one-off compose service (`migrate`, using the `postgres:16` image plus mounted SQL)
  against Postgres before the API restart. Track applied files in a `schema_migrations` table.
- Back up `/data` (EBS snapshot or `pg_dump` to S3) before a migration in dev; production later uses
  RDS/backups.
- Migrations must be backward-compatible for one release.

### E. Secrets change

- `push-tenant-secrets.sh` updates SSM; SSM command restarts the affected container(s); audit entry.

---

## 8. GitHub Actions and environments

| Workflow | Trigger | Role | Purpose |
|---|---|---|---|
| `terraform-plan.yml` | PR/paths + manual | `gha-infra` | fmt, validate, tflint, plan |
| `terraform-apply.yml` | manual + environment approval | `gha-infra` | apply saved plan; audit |
| `build-images.yml` | push main/manual | `gha-deploy` | build/push API+agent to ECR |
| `deploy-app.yml` | manual | `gha-deploy` | SSM deploy, migrate, health, audit |
| `deploy-web.yml` | manual | `gha-deploy` | S3 sync + CloudFront invalidation |
| `ci.yml` (existing) | PR/push | none | lint/typecheck/test/build; container builds |

GitHub Environment `digitalcompanion-dev` variables (not in public repo):
`AWS_REGION`, `AWS_ROLE_ARN` (infra), `AWS_DEPLOY_ROLE_ARN`, `TENANT_ACCOUNT_ID`,
`TF_STATE_BUCKET`, `TF_LOCK_TABLE`, `TENANT_NAME`, `ECR_REGISTRY`, `API_CLOUDFRONT_DOMAIN`,
`WEB_BUCKET`, `WEB_CLOUDFRONT_DISTRIBUTION_ID`, `API_BASE_URL`.

Secrets: none for app keys if SSM is the source of truth; the bootstrap secrets push uses a local
secure path. Optionally store a bootstrap-only secret in the environment, never in the repo.

OIDC trust is restricted to this repository and the environment; every AWS job runs in the
`digitalcompanion-dev` environment so the `sub` condition holds. Fork PRs never receive AWS
credentials. `prod` later gets a required-reviewer environment and separate roles/state/account.

---

## 9. Per-tenant audit

For every tenant:

- `devops/tenancy/tenants/<tenant>/README.md` — non-secret facts: project, env, region, modules,
  CloudFront domains, parameter names, runbooks links.
- `devops/tenancy/tenants/<tenant>/AUDIT.md` — append-only:
  ```
  ## 2026-11-26 — initial infra apply
  Actor: GitHub Actions run <url> / local <profile>
  Commit: <sha>
  Terraform state serial: <n>
  Images: api:<tag>, agent:<tag>
  Result: health OK
  ```
- Git tags: `deploy/<tenant>/<component>/<version>` (and optional `infra/<tenant>/<timestamp>`).
- GitHub Environment deployment history is the second record.
- The deploy workflow writes the same entry to the job summary and creates the deploy tag; it appends
  `AUDIT.md` through a bot commit to `main` (or an `audit/<tenant>` PR if `main` is protected). The
  operator reviews the entry, so the file is not silently rewritten.
- CloudTrail organization trail is the authoritative AWS audit; enable in the tenant baseline phase.
- Budget alerts are direct email; add tenant-specific cost owner.

No account IDs/emails in these public files; the local ops record/SSM/GitHub vars hold them.

---

## 10. Phases

| Phase | Work | Done when |
|---|---|---|
| 0 | Approve this plan; choose TLS/domain, registry, secrets and backup defaults | decisions recorded |
| 1 | Backend bootstrap script + modules skeleton + `digitalcompanion-dev` stack; `terraform plan` review | plan is clean and understood |
| 2 | Apply infra (VPC/EC2/EBS/ECR/CloudFront/SG/IAM); push secrets; first API/agent/Postgres deploy | API `/health` OK through CloudFront |
| 3 | Web S3/CloudFront + full cloud E2E (text, voice, admin) | E2E passes against the tenant |
| 4 | GitHub OIDC + workflows; move first deploy to CI; audit/tagging | deploy via GitHub, audit entries |
| 5 | Backups/alarms/runbook/close-recreate rehearsal; prod profile later | restore and close/recreate rehearsed |

---

## 11. Acceptance

- `terraform plan` is empty after apply.
- A second apply makes no changes; re-running deploy is idempotent.
- API health through HTTPS CloudFront: LLM, DB, Deepgram, LiveKit configured.
- Text chat, guardrails/masking, voice greeting and browser mic work against the tenant.
- Web is served from S3/CloudFront; API CORS allows only the web domain.
- No SSH; SSM access works; no root/IAM users used.
- No secrets/account IDs in Git; secret scan passes.
- `AUDIT.md` has infra and deploy entries with dates and image tags.
- The EC2 public DNS origin is stable across reboots; a replaced EIP triggers a Terraform plan.
- Cost stays near the $25 budget; alerts configured.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Single EC2 host is an availability/resource bottleneck | POC only; alarms + EBS snapshots; production moves to ECS/RDS. |
| Agent native modules may not have a Linux arm64 build | CI builds and boots the arm64 image before apply; fall back to `t3.small` x86 if needed. |
| CloudFront has a 60s origin read timeout for SSE | Keep replies short, send heartbeat comments; move to ALB/Caddy if responses can exceed it. |
| CloudFront origin IP/DNS changes | EIP is stable; Terraform owns the public DNS origin and plans a change if the EIP is replaced. |
| Postgres on EBS has no managed HA/PITR | Daily DLM snapshots + weekly `pg_dump`; restore drill in Phase 5. |
| Over-privileged CI role | Separate `gha-infra`/`gha-deploy`, repo/environment trust conditions, review policies. |
| Secrets leak into state/logs | SSM SecureString values pushed outside Terraform; no `terraform output` of secrets; log redaction. |
| Audit drift between Git and AWS | CloudTrail + Terraform state + deploy tags are authoritative; `AUDIT.md` is the human summary. |

---

## 13. Open decisions (recommended defaults)

1. **API TLS entry:** CloudFront default domain (recommended, no domain/ACM) vs Caddy on EC2 plus a
   custom domain.
2. **Custom domains:** none for POC (recommended); `dc-dev`/`api-dc-dev` later.
3. **Image registry:** per-tenant ECR (recommended) vs a central registry with cross-account pulls.
4. **Secrets:** SSM SecureString (recommended for POC) vs Secrets Manager.
5. **Database:** Postgres container + EBS (recommended for POC) vs RDS now.
6. **Backups:** DLM EBS snapshots + weekly pg_dump to S3 (recommended).
7. **CI roles:** separate `gha-infra` and `gha-deploy` roles (recommended) vs one broad role.
8. **Audit storage:** Git `AUDIT.md` + deploy tags (recommended) vs DynamoDB only.

Once these are confirmed, implementation starts with the backend bootstrap + Terraform modules and a
`terraform plan` — no apply until the plan is reviewed.
