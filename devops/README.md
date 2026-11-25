# DevOps

Thin pipelines, script-first logic, explicit versions, no secrets in git. Part 1 covers CI and image
publishing; Part 2 adds Terraform and AWS deployment.

```
devops/
├── README.md
├── environments/
│   └── README.md            # variable contract per environment (no secrets)
├── scripts/
│   ├── check-env.sh         # validate local .env groups
│   └── smoke.sh             # /health smoke test (+ optional one chat turn)
└── terraform/
    └── README.md            # Part 2 placeholder: modules, state, OIDC
```

## Pipelines

| Workflow | Trigger | Purpose |
|---|---|---|
| [ci.yml](../.github/workflows/ci.yml) | PR + main | install, lint, typecheck, test, build |
| [docker-publish.yml](../.github/workflows/docker-publish.yml) | manual | build/push `api` or `agent` to GHCR |

The full strategy (versioning, environments, Part 2 architecture, rollback, observability) is in
[docs/devops.md](../docs/devops.md).

## Local scripts

```bash
devops/scripts/check-env.sh   # checks the root .env for required variables (no values printed)
devops/scripts/smoke.sh       # curl /health; optional PERSON_ID=… does one text turn
```

## Principles

1. **Thin YAML, script-first.** Pipeline YAML orchestrates; reusable logic belongs in scripts.
2. **Manual deploys.** No automatic production deploy; version + environment are explicit inputs.
3. **Immutable artifacts.** Images are tagged with a version (and `latest` only as a convenience).
4. **Deploy state in git tags.** Part 2: `deploy/{env}/{component}/v{version}`.
5. **No secrets in the repo.** GitHub Environments / AWS Secrets Manager only.
6. **Health before traffic.** Smoke test `/health`; `configured` must be true for required services.
7. **Rollback is redeploy.** Keep previous image tags and backward-compatible migrations.

## Container images

```bash
docker build -f apps/api/Dockerfile -t digitalcompanion-api .
docker build -f apps/agent/Dockerfile -t digitalcompanion-agent .
```

Both use `pnpm deploy --legacy` for a production-only node_modules. The agent image includes ffmpeg and
CA certificates. `.dockerignore` excludes `.env*` so secrets never enter the build context.

## Part 2

Do not add Terraform before Part 1 acceptance. The planned modules, state layout, GitHub OIDC and
deployment flow are described in [terraform/README.md](terraform/README.md),
[docs/devops.md](../docs/devops.md) and
[docs/planning/02-part2-roadmap.md](../docs/planning/02-part2-roadmap.md).
