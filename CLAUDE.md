# CLAUDE.md — Digital Companion

Read [AGENTS.md](AGENTS.md) first. It is the full operating manual; this file is the short entry.
Then read [docs/main.md](docs/main.md) and the `CLAUDE.md` of the subproject you are editing.

## What this is

A voice + text AI companion for older adults. Monorepo: `apps/web` (Next.js), `apps/api` (Express),
`apps/agent` (LiveKit voice worker), `packages/core` (persona, guardrails, types, Postgres),
`db` (SQL), `devops`, `docs`.

## Non-negotiable safety rules

- Never weaken the persona, input guardrails, output filter or masking to make a scenario pass.
- Never store or log unmasked card/SSN/OTP/Medicare numbers. Mask before persistence; the voice
  recorder stores the spoken safe text.
- `DATABASE_URL` and its credentials are server-only. Never use them in `apps/web` or `NEXT_PUBLIC_*`.
- Claude requests: `claude-haiku-5-5`, no sampling params, no prefill, `output_config.effort` low,
  cached persona block, check `stop_reason` including `refusal`.
- The web UI must stay client-friendly for a later Capacitor wrapper.

## Commands

```bash
pnpm dev         # web + api + agent
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify      # everything
```

## Workflow

1. Plan multi-file work before editing.
2. Keep shared contracts in `packages/core`; add tests for guardrail/behavior changes.
3. Update the relevant docs and [docs/history/decision-log.md](docs/history/decision-log.md) for
   architectural decisions.
4. Commit one logical change at a time; never commit secrets or build output.
5. Report what was verified and what needs real credentials (voice, LiveKit, Deepgram, RDS).

## Read next

- [docs/architecture/guardrails.md](docs/architecture/guardrails.md) — safety contracts
- [docs/architecture/voice-pipeline.md](docs/architecture/voice-pipeline.md) — agent hooks
- [docs/architecture/data-model.md](docs/architecture/data-model.md) — tables and RLS
- [docs/local-dev.md](docs/local-dev.md) — accounts, env, run, troubleshoot
- [docs/agent-workflows.md](docs/agent-workflows.md) — detailed agent workflow
- [docs/planning/00-master-plan.md](docs/planning/00-master-plan.md) — the full plan
