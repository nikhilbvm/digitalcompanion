# CLAUDE.md — packages/core

Shared persona, guardrails, types, Supabase client, memory helpers. **No app or LiveKit imports.**

## Read first

- [docs/architecture/guardrails.md](../../docs/architecture/guardrails.md)
- [docs/architecture/data-model.md](../../docs/architecture/data-model.md)
- [docs/main.md](docs/main.md)

## Invariants

- `COMPANION_PERSONA` is the prompt-cache prefix: keep it byte-stable. Person facts go in
  `buildProfileBlock`.
- Severity priority: `self_harm > emergency > scam > abuse > medical_question > distress > none`.
  Patterns set the floor; the classifier can only raise it.
- Mask card/SSN/OTP/Medicare before persistence, classifier calls and logs.
- `createSupabaseClient` uses the service role key and is server-only. Never export it to the browser.
- Types are camelCase; row mappers convert snake_case at the boundary.

## Commands

```bash
pnpm --filter @companion/core typecheck
pnpm --filter @companion/core test
```

## Changing guardrails

1. Add a failing test in `test/`.
2. Make the narrowest rule change.
3. Run the full repo `pnpm test`, `pnpm typecheck`, `pnpm lint`.
4. Update [docs/architecture/guardrails.md](../../docs/architecture/guardrails.md).
5. Never weaken an existing rule to make a scenario pass.

## Cross-links

[README](README.md) · [docs](docs/main.md) · [root AGENTS](../../AGENTS.md) ·
[API](../../apps/api/CLAUDE.md) · [Agent](../../apps/agent/CLAUDE.md) · [Web](../../apps/web/CLAUDE.md)
