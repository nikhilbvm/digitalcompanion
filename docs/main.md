# Documentation index

This is the single index for Digital Companion. Every durable doc is linked here; every subproject
links back to the root [README](../README.md).

> Source of truth for the product: [`initial thoughts`](../initial%20thoughts).
> Source of truth for the plan: [planning/00-master-plan.md](planning/00-master-plan.md).

---

## Start here

| Audience | Read |
|---|---|
| New developer | [RUN-LOCAL.md](../RUN-LOCAL.md) → [local-dev.md](local-dev.md) |
| Coding agent | [AGENTS.md](../AGENTS.md) → [CLAUDE.md](../CLAUDE.md) → [agent-workflows.md](agent-workflows.md) |
| Architect | [architecture/system.md](architecture/system.md) → [planning/00-master-plan.md](planning/00-master-plan.md) |
| Operator / DevOps | [devops.md](devops.md) → [devops/README.md](../devops/README.md) |
| Safety reviewer | [architecture/guardrails.md](architecture/guardrails.md) → [architecture/security-privacy.md](architecture/security-privacy.md) |

---

## Architecture

- [system.md](architecture/system.md) — components, responsibilities, data flow, failure modes
- [voice-pipeline.md](architecture/voice-pipeline.md) — token → dispatch → STT → LLM → TTS → persistence
- [guardrails.md](architecture/guardrails.md) — threat model, patterns, classifier, output filter
- [data-model.md](architecture/data-model.md) — tables, indexes, RLS, retention
- [security-privacy.md](architecture/security-privacy.md) — PII, secrets, logging, POC risks

## Planning

- [00-master-plan.md](planning/00-master-plan.md) — product, repo layout, contracts, phases, acceptance
- [01-part1-checklist.md](planning/01-part1-checklist.md) — executable Part 1 checklist and status
- [02-part2-roadmap.md](planning/02-part2-roadmap.md) — memory, scheduled ring, AWS/Terraform
- [03-aws-tenancy.md](planning/03-aws-tenancy.md) — chosen account-vending platform, SSO bootstrap and tenant lifecycle
- [04-tenant-infrastructure.md](planning/04-tenant-infrastructure.md) — Terraform tenant stack, secrets, audit and GitHub build/deploy pipeline
- [tenancy-model.md](tenancy-model.md) — one organization vs many tenants, and how to explain it to a user

## Development

- [local-dev.md](local-dev.md) — accounts, environment, migration, run, troubleshooting
- [agent-workflows.md](agent-workflows.md) — how agents plan, edit, verify, document, commit
- [testing-local.md](testing-local.md) — automated backend/voice E2E and browser acceptance checklist
- [cloud-testing.md](cloud-testing.md) — AWS resources, configuration and security needed for cloud E2E
- [devops.md](devops.md) — CI, image publishing, environments, Part 2 deployment design

## Subprojects

| Subproject | README | Docs | Agent file |
|---|---|---|---|
| Web | [apps/web/README.md](../apps/web/README.md) | [main](../apps/web/docs/main.md) · [voice UI](../apps/web/docs/voice-ui.md) | [CLAUDE](../apps/web/CLAUDE.md) |
| API | [apps/api/README.md](../apps/api/README.md) | [main](../apps/api/docs/main.md) · [chat stream](../apps/api/docs/chat-stream.md) | [CLAUDE](../apps/api/CLAUDE.md) |
| Agent | [apps/agent/README.md](../apps/agent/README.md) | [main](../apps/agent/docs/main.md) · [pipeline](../apps/agent/docs/voice-pipeline.md) | [CLAUDE](../apps/agent/CLAUDE.md) |
| Core | [packages/core/README.md](../packages/core/README.md) | [main](../packages/core/docs/main.md) | [CLAUDE](../packages/core/CLAUDE.md) |
| Database | [db/README.md](../db/README.md) | [data model](architecture/data-model.md) | — |
| DevOps | [devops/README.md](../devops/README.md) | — | — |

## Reviews

- [2026-11-25-setup-review.md](reviews/2026-11-25-setup-review.md) — knowledge, monorepo, local and cloud
  readiness; fixed defects and remaining deployment gaps

## History

- [history/aws-tenancy-log.md](history/aws-tenancy-log.md) — dated AWS tenancy/SSO/tenant work
- [history/decision-log.md](history/decision-log.md) — why the architecture looks like this
- [history/README.md](history/README.md) — what belongs in history
- [CHANGELOG.md](../CHANGELOG.md) — user-visible changes

---

## Documentation rules

1. New durable doc → linked from this index in the same commit.
2. Subproject behavior change → update that subproject's `docs/main.md` and/or README.
3. Architectural decision → append to [history/decision-log.md](history/decision-log.md).
4. Safety contract change → update [guardrails.md](architecture/guardrails.md) **and** add tests.
5. Never document a secret value. Use variable names only.
