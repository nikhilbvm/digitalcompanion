# CLAUDE.md — apps/api

Express API for text chat, LiveKit tokens and admin data.

## Read first

- [docs/main.md](docs/main.md)
- [docs/chat-stream.md](docs/chat-stream.md)
- [../../docs/architecture/guardrails.md](../../docs/architecture/guardrails.md)

## Invariants

- `src/app.ts` exports `createApp()`; only `src/index.ts` calls `listen()`. Keep it Lambda/API Gateway
  ready.
- Text chat is SSE (`meta`, `delta`, `flag`, `done`, `error`); keep the frame contract stable.
- The persona block is cached; safety instructions are separate system blocks.
- No `temperature`/`top_p`/`top_k`, no prefill. `claude-haiku-5-5`, effort low, check `stop_reason`.
- Persist masked text only. Flag details never contain raw identifiers.
- `DATABASE_URL` and its credentials are server-only.
- The classifier runs in parallel in text mode; pattern hits are synchronous and authoritative.
- Log IDs, categories and timings — never message text.

## Commands

```bash
pnpm --filter @companion/api dev
pnpm --filter @companion/api typecheck
pnpm --filter @companion/api build
pnpm verify
```

## Where to change what

| Change | Location |
|---|---|
| Endpoint/SSE contract | `src/routes/`, `src/services/chat-turn.ts`, docs |
| Anthropic request policy | `src/services/anthropic.ts` |
| Persistence/masking | `src/services/store.ts` + core |
| Token/dispatch metadata | `src/routes/livekit.ts` |
| Config/env | `src/config.ts`, `.env.example`, `docs/local-dev.md` |

## Cross-links

[README](README.md) · [docs](docs/main.md) · [core](../../packages/core/CLAUDE.md) ·
[agent](../../apps/agent/CLAUDE.md) · [web](../../apps/web/CLAUDE.md) · [AGENTS](../../AGENTS.md)
