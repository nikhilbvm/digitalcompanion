# Digital Companion

A voice-and-text AI companion for older adults in the US. One mobile-first screen with a large call
button, an optional chat/transcript area, and a right-side settings drawer — with light safety
guardrails on every turn, persistent transcripts, and a small admin view for a family administrator.

This repository is a monorepo containing the web app, API, LiveKit voice agent, shared core package,
database migrations, DevOps/CI, documentation, and the agent operating system used to develop it.

> **Status: Part 1 (local POC).** The end-to-end pipeline is implemented. The manual voice demo
> requires a real OpenRouter key, Deepgram, LiveKit Cloud and Postgres/RDS access. Part 2 (memory capture,
> scheduled check-in calls, AWS/Terraform) is planned in
> [docs/planning/02-part2-roadmap.md](docs/planning/02-part2-roadmap.md).

> **Safety.** This is not an emergency service. In an emergency call 911; for suicidal thoughts call
> or text 988. The POC has no authentication and must not be exposed publicly.

---

## What it does

- **Call** — the bottom phone button asks for the microphone and starts a real-time voice
  conversation. Deepgram Nova-3 transcribes, Claude Haiku 5.5 replies, Deepgram Aura-2 speaks, and
  LiveKit Cloud carries the media. Interruptions are supported.
- **Optional chat** — Settings can show a text/transcript area. Typed messages stream replies; during
  a call the same area shows the live transcript with auto-scroll. Chat is off by default.
- **Settings** — choose who is using the companion and persist that choice plus “Show chat” locally.
- **Every turn** passes through deterministic input checks plus a small Haiku classifier, then an
  output filter on each sentence before it is spoken or shown.
- **Conversations, messages and guardrail flags** are stored in Postgres (local Docker or Amazon RDS) and visible in `/admin`.

The fixed persona is openly an AI, never asks for money/codes/identifiers, never gives
medical/legal/financial advice, never impersonates a person, and routes emergencies to 911/988.
See [docs/architecture/guardrails.md](docs/architecture/guardrails.md).

---

## Repository map

| Path | What it is | Docs |
|---|---|---|
| [`apps/web/`](apps/web/) | Next.js App Router + Tailwind, large-type UI and `/admin` | [README](apps/web/README.md) · [docs](apps/web/docs/main.md) · [CLAUDE](apps/web/CLAUDE.md) |
| [`apps/api/`](apps/api/) | Express API: text chat SSE, LiveKit tokens, people/conversations | [README](apps/api/README.md) · [docs](apps/api/docs/main.md) · [CLAUDE](apps/api/CLAUDE.md) |
| [`apps/agent/`](apps/agent/) | LiveKit Agents JS voice worker (Deepgram + Claude) | [README](apps/agent/README.md) · [docs](apps/agent/docs/main.md) · [CLAUDE](apps/agent/CLAUDE.md) |
| [`packages/core/`](packages/core/) | Persona, guardrails, shared types, Postgres/memory helpers | [README](packages/core/README.md) · [docs](packages/core/docs/main.md) · [CLAUDE](packages/core/CLAUDE.md) |
| [`db/`](db/) | SQL migrations, seed data and RDS/local setup | [README](db/README.md) |
| [`devops/`](devops/) | Tenant Terraform, deploy scripts, CI/CD and environment contracts | [README](devops/README.md) · [docs](docs/devops.md) |
| [`.github/`](.github/) | CI, Docker publishing, PR/issue templates, Copilot instructions | [workflows](.github/workflows/) |
| [`docs/`](docs/) | Architecture, planning, local dev, agent workflows, history | [index](docs/main.md) |
| [`initial thoughts`](initial%20thoughts) | Original product brief (source of truth) | — |

**Agent entry points:** [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md) ·
[docs/agent-workflows.md](docs/agent-workflows.md) · [.claude/settings.json](.claude/settings.json)

---

## Quickstart

Prerequisites: **Node 22 LTS**, **pnpm 10** (via corepack), and **Docker** for the local Postgres
service (or an RDS `DATABASE_URL`).

```bash
# 1. Install
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install

# 2. Configure
cp .env.example .env
# fill in: OPENROUTER_API_KEY, DEEPGRAM_API_KEY, LIVEKIT_*, DATABASE_URL, NEXT_PUBLIC_*

# 3. Start local Postgres and apply the schema
pnpm db:up
pnpm db:migrate
pnpm db:seed        # optional demo person
# For RDS, set DATABASE_URL + DATABASE_SSL=true and run: pnpm db:migrate

# 4. Run all three apps
pnpm dev
# web  → http://localhost:3000
# api  → http://localhost:4000
# agent → LiveKit worker (exits early if keys are missing)
```

Create a person at [http://localhost:3000/admin](http://localhost:3000/admin), then choose them in
Settings on the main screen. Use the phone button to call; enable **Show chat** if you want typed
chat or the live transcript.

Full setup, account creation and troubleshooting: [docs/local-dev.md](docs/local-dev.md).
Short run guide: [RUN-LOCAL.md](RUN-LOCAL.md).

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | web + api + agent together |
| `pnpm build` | build api, agent and web |
| `pnpm lint` | ESLint across the repo |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm test` | Vitest guardrail + text tests |
| `pnpm check:secrets` | scans tracked files for live API keys |
| `pnpm verify` | secret scan → lint → typecheck → test → build |

---

## Architecture

```
Browser (Next.js, Capacitor-ready)
  ├── livekit-client ──► LiveKit Cloud ──► apps/agent (Deepgram STT/TTS + Claude)
  └── fetch/SSE ───────► apps/api (Express) ──► Postgres (local / RDS)
                                │
                                └── OpenRouter → Claude Haiku 5.5 (chat + classifier)
```

- [docs/architecture/system.md](docs/architecture/system.md) — components and data flow
- [docs/architecture/voice-pipeline.md](docs/architecture/voice-pipeline.md) — voice turn lifecycle
- [docs/architecture/data-model.md](docs/architecture/data-model.md) — tables, RLS, retention
- [docs/architecture/guardrails.md](docs/architecture/guardrails.md) — exact safety rules
- [docs/architecture/security-privacy.md](docs/architecture/security-privacy.md) — PII and POC risks

---

## Documentation index

- **Plan:** [docs/planning/00-master-plan.md](docs/planning/00-master-plan.md) ·
  [Part 1 checklist](docs/planning/01-part1-checklist.md) ·
  [Part 2 roadmap](docs/planning/02-part2-roadmap.md) ·
  [tenant infrastructure](docs/planning/04-tenant-infrastructure.md)
- **DevOps:** [docs/devops.md](docs/devops.md) · [devops/README.md](devops/README.md)
- **Local dev:** [docs/local-dev.md](docs/local-dev.md) · [testing](docs/testing-local.md) ·
  [cloud testing](docs/cloud-testing.md)
- **Agent workflows:** [docs/agent-workflows.md](docs/agent-workflows.md)
- **Review:** [docs/reviews/2026-11-25-setup-review.md](docs/reviews/2026-11-25-setup-review.md) —
  local/cloud readiness, fixed defects and remaining deployment gaps
- **History:** [docs/history/decision-log.md](docs/history/decision-log.md)
- **Full index:** [docs/main.md](docs/main.md)

---

## Part 2 (planned)

Memory capture and review, scheduled check-in ring, AWS deployment with Terraform (cheap EC2 POC
first, then ECS Fargate/RDS), real family authentication, observability, and Capacitor packaging. See
[docs/planning/02-part2-roadmap.md](docs/planning/02-part2-roadmap.md) and the
[tenant infrastructure plan](docs/planning/04-tenant-infrastructure.md). Part 2 does not start until
Part 1 acceptance passes.
