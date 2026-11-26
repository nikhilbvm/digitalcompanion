# DevOps and CI/CD

Part 1 has CI and container publishing only. Part 2 adds Terraform and AWS deployment. The design
follows the reference project's principles: **thin YAML, script-first, manual deploys with explicit
versions, no secrets in git, and deployment state recorded in git tags.**

---

## 1. Current state

| Workflow | Trigger | What it does |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | PR + push to `main` | pnpm install, lint, typecheck, test, build, container builds, API `/health` + agent image smoke |
| [`docker-publish.yml`](../.github/workflows/docker-publish.yml) | manual | build API or agent image, push to GHCR |
| [`terraform-plan.yml`](../.github/workflows/terraform-plan.yml) | PR/manual | fmt, validate and plan the tenant stack |
| [`terraform-apply.yml`](../.github/workflows/terraform-apply.yml) | manual | fresh plan + apply with state lock |
| [`build-images.yml`](../.github/workflows/build-images.yml) | main/manual | ARM64 API/agent build and tenant ECR push |
| [`deploy-app.yml`](../.github/workflows/deploy-app.yml) | manual | SSM deploy, migration, health |
| [`deploy-web.yml`](../.github/workflows/deploy-web.yml) | manual | S3 sync, CloudFront invalidation, smoke |

The AWS workflows assume the GitHub OIDC roles through the `digitalcompanion-dev` Environment. No
AWS keys or application secrets are stored in GitHub; application secrets live in tenant SSM.

CI needs no application secrets. Docker publishing uses `GITHUB_TOKEN` with `packages: write`.

Local equivalent:

```bash
pnpm verify
docker build -f apps/api/Dockerfile -t digitalcompanion-api .
docker build -f apps/agent/Dockerfile -t digitalcompanion-agent .
```

---

### Why CI builds the images, and what it does not do

Docker images are the **deployable artifacts** for ECS Fargate. CI builds both on every push to catch
breakage that `pnpm build` alone cannot: missing production dependencies after `pnpm deploy --prod`,
`.dockerignore` mistakes, native modules (agent), runtime CMD/permissions, and the bundled core
package. It does **not** push anything; `docker-publish.yml` is the manual publish step.

Local development does **not** use these images. `pnpm dev` runs Next, tsx and the LiveKit worker
directly; Docker is only used for the local Postgres service. Building images locally is optional
(`docker build -f apps/api/Dockerfile .`) and is only needed to test container parity or prepare a
cloud release. CI uses GitHub Actions layer cache (`scope=api` / `scope=agent`), so unchanged layers
are reused after the first run.

If CI time becomes a constraint, the next step is path-filtering the Docker job (Dockerfiles, lockfile,
package manifests, `packages/core`, `apps/api`, `apps/agent`) rather than removing it; deployment
should still build from the exact commit being released.

## 2. Versioning and artifacts

- **Conventional commits** determine intent; Part 1 does not run semantic-release yet.
- Release tags are `vX.Y.Z`; images are tagged with the same version plus a moving `main` tag.
- Deploy tracking tags are reserved for Part 2:
  `deploy/{env}/{component}/v{version}` (e.g. `deploy/prod/api/v0.1.0`).
- Artifacts: container images in GHCR (api, agent). Web is built from source by the hosting provider
  (static S3 + CloudFront export) rather than stored as a long-lived binary.
- Rollback = redeploy the previous version/tag; no separate rollback pipeline is required.

---

## 3. Environments

Part 2 will use two GitHub Environments. Values live in GitHub secrets / AWS Secrets Manager, never in
the repo.

| Environment | Purpose | Approval | Services |
|---|---|---|---|
| `dev` | integration/staging | no | RDS dev database, LiveKit dev project, AWS dev |
| `prod` | family use | yes (required reviewer) | RDS prod database, LiveKit prod, AWS prod |

Same variable contract as [`.env.example`](../.env.example). See
[devops/environments/README.md](../devops/environments/README.md).

---

## 4. Part 2 target architecture

### Hosting decision (default)

> **Initial cloud POC:** a single EC2 `t4g.small` with Docker Compose (API + agent + Postgres), S3 +
> CloudFront web, and the API behind a second CloudFront distribution, no ALB/NAT/RDS,
> ~$20–25/month on demand. This account is not free-tier eligible. The managed profile below is the
> **production target**, adopted before real users or real data. See [cloud-testing.md](cloud-testing.md)
> and [planning/04-tenant-infrastructure.md](planning/04-tenant-infrastructure.md).


| Component | Target | Why |
|---|---|---|
| Web (`apps/web`) | **AWS S3 + CloudFront** | The UI is client-only, so it builds to a static `out/` directory; CloudFront serves it with TLS and caching. AWS Amplify Hosting is an alternative if preview builds are needed. |
| API (`apps/api`) | **AWS ECS Fargate** | Normal container, long-lived; `createApp()` also allows Lambda/API Gateway later. |
| Voice agent (`apps/agent`) | **AWS ECS Fargate** | Long-lived worker with native modules; outbound to LiveKit only, no inbound listener. |
| Database | **Amazon RDS for PostgreSQL** | Private subnets, encryption at rest, automated backups. Aurora Serverless v2 is the scale-up option. |
| Media / voice | **LiveKit Cloud** | Managed rooms, agent dispatch, TURN. |
| LLM / STT / TTS | **OpenRouter → Anthropic / Deepgram** | OpenRouter is the default LLM gateway (Claude Haiku 5.5); direct Anthropic is an optional fallback. Deepgram handles STT/TTS. |
| Secrets | AWS Secrets Manager + GitHub Environments (Part 2) | No secrets in git. |

Set `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_LIVEKIT_URL` in the web **build** environment; they
are inlined at build time. Upload the resulting `apps/web/out/` directory to S3 and invalidate
CloudFront.

```
GitHub Actions (OIDC → AWS role, no static keys)
  ├── ci: lint/typecheck/test/build
  ├── build images → ECR (api, agent)
  └── deploy (manual, version + env)
        ├── ECS Fargate service: api (behind ALB or API Gateway)
        ├── ECS Fargate service: agent (LiveKit worker, no inbound)
        └── migration job (psql or a one-off ECS task)

AWS
  ├── VPC: public ALB + private tasks
  ├── ECR: api/agent images
  ├── ECS Fargate: api, agent
  ├── RDS PostgreSQL: private subnets, encryption, backups, TLS
  ├── ALB + WAF (or API Gateway + Lambda for api)
  ├── Secrets Manager: OPENROUTER/ANTHROPIC/DEEPGRAM/LIVEKIT/DATABASE_URL
  ├── CloudWatch: logs, metrics, alarms
  └── S3: optional exports/backups

Managed: Amazon RDS · LiveKit Cloud · OpenRouter (Anthropic upstream) · Deepgram
Web: S3 + CloudFront (static Next export); Capacitor wrapper later
```

### Why ECS Fargate for the agent

The LiveKit worker is long-lived, spawns job processes, and needs native modules (onnxruntime for
VAD). Fargate is a simpler fit than Lambda for the worker. The API can run on Fargate too; Lambda +
API Gateway remains an option because `createApp()` is separate from `listen()`.

### Why the API is also a container on Fargate

- **SSE streaming.** `POST /chat` is a long-lived server-sent-event response. Fargate behind an ALB
  handles it naturally; API Gateway HTTP APIs do not stream responses, and Lambda response streaming
  would require a Function URL and a different front door.
- **Warm, stateful process.** The API keeps a `pg` connection pool and warm OpenRouter/Anthropic/Express state.
  Lambda would need RDS Proxy or careful pool management per invocation, plus cold-start latency.
- **One operational model.** API and agent share the same VPC, RDS security group, Secrets Manager
  entries, image pipeline, task roles and CloudWatch logs. Running the API on Lambda would add a
  second deployment and networking model.
- **The image is already the tested artifact.** CI builds the exact API image, starts it, and checks
  `/health`; ECS deploys that same image. The Dockerfile is also the local production-parity path.

Lambda is still possible later because the app factory is separate from `listen()`; switching would
mean adding a Lambda handler/adapter, a streaming-capable front door, and RDS Proxy or a connection
strategy. For a latency-sensitive chat API with a LiveKit worker already on Fargate, one platform is
the simpler, more predictable choice.

### Cloud runtime notes

- The API reads `API_PORT` or the cloud-provided `PORT` and is the only public service. The agent
  worker needs outbound access to LiveKit Cloud and no inbound listener.
- `NEXT_PUBLIC_*` values are inlined into the web build. Set them in the hosting provider's build
  environment; locally `next.config.ts` loads the root `.env`.
- The API/agent containers use process environment variables; they do not rely on a mounted `.env`.
  Local development loads the root `.env` via dotenv.
- Docker image builds are validated in CI on every push. Deployment is still manual (and not
  implemented until Part 2).

### Web deployment (S3 + CloudFront)

```bash
pnpm --filter @companion/web build          # → apps/web/out (static export)
aws s3 sync apps/web/out s3://<bucket> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

- The app uses `trailingSlash: true`, so every route is a directory with `index.html`. Configure the
  CloudFront origin as the **S3 website endpoint** (which resolves index documents), or add a
  CloudFront Function that appends `index.html` to directory/extensionless requests.
- Default root object: `index.html`. Optional custom error response: 404 → `/404.html`.
- Cache HTML briefly (`no-cache` or a short TTL) and hashed `/_next/static/*` assets aggressively.
- Build with `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_LIVEKIT_URL` set; they are inlined.
- No server is required; do not put `DATABASE_URL` or any server secret in this build environment.

### Terraform layout

The active tenant/POC implementation is
[planning/04-tenant-infrastructure.md](planning/04-tenant-infrastructure.md): EC2 + Docker Compose +
EBS Postgres, S3/CloudFront web, SSM secrets, per-tenant Terraform state, and GitHub
plan/apply/deploy workflows. The implemented modules and stack are under
[`devops/terraform/`](../devops/terraform/); the tenant stack is applied and the post-apply plan is
empty.

Production migration modules (not implemented yet):

- `network` — VPC, subnets, security groups
- `ecr` — repositories and lifecycle policy
- `ecs-api` — cluster, task definition, service, ALB/API Gateway
- `ecs-agent` — worker task definition and service
- `secrets` — Secrets Manager entries wired to task definitions
- `observability` — log groups, alarms, dashboards
- `iam` — task roles, GitHub OIDC deploy role

State: remote S3 + DynamoDB lock, one state per environment. Do not build until Part 2 starts.

---

## 5. Pipeline design for Part 2

```
PR            → ci (required check)
push main     → ci + build images tagged main-<sha>
manual build  → version input → image tags + GitHub Release + changelog
manual deploy → version + env → pull images → run migration → update ECS services
                → smoke test /health → push deploy tag
```

Principles:

- Manual deploys until the product is stable; no auto-deploy to `prod`.
- `prod` protected by a required reviewer.
- Migration runs before the new API task set; migrations are backward-compatible for one release.
- Smoke test: `/health` `ok:true` and configured services true.
- Deploy tags record what is live: `git tag -l 'deploy/prod/*'`.
- Rollback: deploy the previous version tag; database migrations must be reversible or
  forward-compatible.

---

## 6. Observability

Part 1 logs structured JSON to stdout (`chat_turn`, `voice_turn`) without message text. Part 2:

- CloudWatch Logs per service; 30-day retention default.
- Alarms: 5xx rate, chat latency p95, agent crash loop, classifier degradation rate, flag volume by
  category.
- Metrics: turns, refusals, input/output flags, voice speech-to-first-audio, token usage/cost.
- No transcript text in logs; use IDs and categories.

---

## 7. Security operations

- GitHub OIDC to AWS; no long-lived AWS keys.
- Least-privilege task roles; agent has no inbound network.
- Secrets rotated on a schedule; old keys revoked.
- `DATABASE_URL` and DB credentials never in the web bundle.
- WAF/rate limits before public exposure; admin auth is mandatory (Part 2).
- Backup/restore drill for RDS before family use.
- Dependency scanning (Dependabot/CodeQL) and secret scanning enabled in Part 2.

---

## 8. Open decisions

1. API runtime: ECS Fargate vs Lambda/API Gateway. Default: Fargate for parity with the agent.
2. Web hosting: **decided = S3 + CloudFront static export**. API/agent use EC2 + Compose for the
   cheap POC, then ECS Fargate for production.
3. Terraform state backend: S3+DynamoDB, one state per env.
4. Image registry: GHCR for Part 1, ECR for Part 2.
5. Release automation: semantic-release vs manual tags. Default: manual tag for the POC, revisit when
   multiple components release independently.
