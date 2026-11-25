# Setup review — knowledge, monorepo, local and cloud

Date: 2026-11-25 · Scope: whole repository · Trigger: "review if this setup is correct for saving
knowledge, the monorepo structure, running all apps locally and in cloud, and building/deploying via
GitHub."

## Verdict

The foundation is correct for Part 1 and ready for cloud hosting of the API and agent. One deployment
layer is deliberately missing: there is **no automated cloud deploy yet** (no Terraform, no deploy
workflow, no auth). That is Part 2 by design, not an accidental gap.

| Area | Status |
|---|---|
| Knowledge capture (docs, agent files, history, cross-links) | **Good** — 40 docs, 0 broken links, decision log + session record |
| Monorepo structure and package boundaries | **Good** — pnpm workspaces, one-way dependencies, apps bundle core |
| Run all apps locally | **Good** — verified web/api/agent start paths; real voice needs keys |
| Build all apps in CI | **Good** — lint, typecheck, 66 tests, Next/tsup builds |
| Build API/agent containers | **Good** — CI builds both, smoke-tests API `/health`, and confirms the agent image boots to its config check |
| Publish images via GitHub | **Partial** — manual GHCR workflow; no release/version automation |
| Deploy to cloud via GitHub | **Not implemented** — Part 2 (Terraform, environments, deploy workflow) |
| Public production readiness | **Not ready** — no auth, rate limits, retention, audit, escalation |

## What was checked

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify`.
- Built API health and 503 behavior; `PORT` fallback; dev-mode `tsx` API.
- Built web `/` and `/admin`; root `.env` values inlined into the Next build.
- Agent missing-env behavior and build.
- Markdown link integrity across all docs.
- Docker install/build/deploy sequence simulated outside Docker; both Dockerfiles built by CI.
- GitHub Actions runs on every push, including the new container-build job.
- Secret scan of tracked files.

## Defects found and fixed in this review

| Finding | Impact | Fix |
|---|---|---|
| The web app did not read the root `.env` | `NEXT_PUBLIC_*` overrides (e.g. a non-default API port) were ignored locally | `apps/web/next.config.ts` loads the root `.env` with dotenv; verified by building with a test value and finding it in `.next` |
| API only read `API_PORT` | Cloud runtimes that inject `PORT` would bind the wrong port | `apps/api/src/config.ts` falls back to `PORT`; verified on port 4100 |
| Dockerfiles relied on corepack auto-resolution | Less deterministic builds | `corepack prepare pnpm@10.34.9 --activate` in both Dockerfiles |
| CI never built the Dockerfiles | Container regressions could ship unnoticed | New `docker` job builds both images, starts the API to check `/health`, and runs the agent with no env to prove the bundle/native modules load; both pass |
| Cloud runtime assumptions were under-documented | Hosting mistakes likely | Added cloud runtime notes to [docs/devops.md](../devops.md) and the env contract |

## Remaining gaps before a cloud deployment

These are intentional Part 2 items, not bugs in Part 1:

1. **No deploy workflow.** `docker-publish.yml` pushes images to GHCR manually; nothing deploys them.
   Part 2 adds ECR, ECS/Lambda, GitHub Environments and deploy tags.
2. **No Terraform yet.** `devops/terraform/` is a README-only placeholder with the planned modules.
3. **No migration automation.** Apply `supabase/migrations/0001_init.sql` manually until a migration
   job exists.
4. **No web container.** The web app is a static Next export for S3 + CloudFront; `NEXT_PUBLIC_*`
   must be set in the build environment. Local builds load the root `.env`.
5. **No auth, rate limits, audit log, retention, or human escalation.** Do not expose the POC
   publicly. See [security-privacy.md](../architecture/security-privacy.md).
6. **No API/web integration tests.** Guardrails and the voice stream filter are unit-tested; the
   SSE/store/browser paths are not. Add API tests with a mocked store/Anthropic before production.
7. **No agent liveness endpoint.** The worker relies on LiveKit registration; ECS should alarm on
   task restarts and connection failures. Part 2 observability.
8. **Docker builds were not run locally** (Docker daemon unavailable). CI now builds both images on
   every push, which covers this.
9. **LiveKit dispatch is token-based and only applies when the room is created.** If reconnecting to
   an existing room without an agent, a dispatch may not occur. Part 2 can use the explicit dispatch
   API or always create a fresh conversation/room.
10. **No release versioning.** Images accept arbitrary tags; `latest` always moves. Add a version
    strategy when releases start.

## Cloud run path (what is already true)

### API container

```
docker build -f apps/api/Dockerfile -t companion-api .
docker run --rm -p 4000:4000 --env-file .env companion-api
```

- Listens on `PORT` (or `API_PORT`), server-only secrets, `/health` reports configured services.
- Set `CORS_ORIGIN` to the web origin; only the API is publicly exposed.
- `createApp()` is separate from `listen()` for a later Lambda/API Gateway adapter.

### Agent container

```
docker build -f apps/agent/Dockerfile -t companion-agent .
docker run --rm --env-file .env companion-agent
```

- Outbound only: LiveKit Cloud, Deepgram, Anthropic, Supabase. No inbound port or load balancer.
- `AGENT_NAME` must match the API's token dispatch name.
- Needs `ffmpeg`/CA certificates, included in the image.

### Web

- Build with `NEXT_PUBLIC_API_BASE_URL` pointing at the deployed API and `NEXT_PUBLIC_LIVEKIT_URL` at
  the LiveKit project; these are inlined at build time.
- `pnpm --filter @companion/web build` writes `apps/web/out/`; upload it to S3 behind CloudFront.
  The app uses `trailingSlash: true`, so routes map to `index.html` directories.
- The UI is client-only and does not hold server secrets.

### Database and LiveKit

- Run `supabase/migrations/0001_init.sql` once per Supabase project.
- Use a separate Supabase project and LiveKit project per environment.
- Keep the Supabase service role key in the API/agent secret store only.

## Recommended next sequence

1. Manual Part 1 acceptance with real keys (voice + text + masking + flags).
2. Add API integration tests for `/chat` and the token route with mocks.
3. Add auth/retention/audit (Part 2D) before any family use.
4. Terraform + deploy workflow for `dev` (Part 2C), then a prod environment with approval.
5. Add image/version release automation and agent liveness alarms.

Re-verify:

```bash
pnpm verify
gh run list --limit 3
```
