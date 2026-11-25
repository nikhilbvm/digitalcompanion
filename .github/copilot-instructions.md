# Copilot instructions — Digital Companion

Read [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md) first; this is a condensed entry.

Digital Companion is a voice + text AI companion for older adults: `apps/web` (Next.js),
`apps/api` (Express), `apps/agent` (LiveKit worker), `packages/core` (persona/guardrails/types),
`db` (SQL), `devops`, `docs`.

## Safety invariants

- Never weaken persona rules, input guardrails, output filtering or masking to make a scenario pass.
- Mask card/SSN/OTP/Medicare numbers before persistence or classifier calls; never echo them.
- `DATABASE_URL` and its credentials are server-only; never use them in the web app or `NEXT_PUBLIC_*`.
- LLM requests: OpenRouter `anthropic/claude-haiku-5.5` by default, or direct `claude-haiku-5-5` with
  `LLM_PROVIDER=anthropic`; no sampling params, no prefill, effort low, cached prefix, check refusals.
- The web UI stays client-only (Capacitor-ready).

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Workflow

Plan multi-file work; keep shared contracts in `packages/core`; add tests for behavior changes; update
docs in the same change; one logical commit; never commit secrets or build output.

Key docs: [guardrails](../docs/architecture/guardrails.md) ·
[voice pipeline](../docs/architecture/voice-pipeline.md) ·
[data model](../docs/architecture/data-model.md) ·
[local dev](../docs/local-dev.md).
