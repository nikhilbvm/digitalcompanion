# CLAUDE.md — apps/agent

LiveKit voice worker for Digital Companion.

## Read first

- [docs/main.md](docs/main.md)
- [docs/voice-pipeline.md](docs/voice-pipeline.md)
- [../../docs/architecture/voice-pipeline.md](../../docs/architecture/voice-pipeline.md)
- [../../docs/architecture/guardrails.md](../../docs/architecture/guardrails.md)

## Invariants

- Build before running: LiveKit forks job processes under plain Node; `dev` and `start` use `dist/`.
- `AGENT_NAME` must match the API token dispatch name.
- Job metadata (`ctx.job.metadata`) is the only trusted source of `personId`/`conversationId`.
- `onUserTurnCompleted` awaits the input guardrail, masks identifiers in the ChatMessage, persists the
  masked user turn, and sets the per-turn safety instruction.
- `llmNode` filters every sentence and persists the **safe filtered text**, not the raw LLM output, so
  the chat context and live transcript are safe as well as the audio. `ttsNode` is a second layer for
  non-LLM text.
- `CompanionOpenRouterLLM` is the default voice LLM adapter (effort low, cached system block,
  provider pin, refusal fallback); `CompanionAnthropicLLM` is the direct fallback.
- Recorder failures must never cut the audio pipeline; log and continue.
- `DATABASE_URL` and its credentials are server-only.
- Do not log transcripts, care notes or identifiers.

## Commands

```bash
pnpm --filter @companion/agent dev
pnpm --filter @companion/agent typecheck
pnpm --filter @companion/agent build
pnpm verify
```

## Where to change what

| Change | Location |
|---|---|
| Session models/VAD/turn detection | `src/main.ts` |
| Guardrail hooks / persistence timing | `src/companion-agent.ts` |
| LLM request policy | `src/llm/openrouter.ts`, `src/llm/anthropic.ts` |
| Sentence filter / latency tap | `src/guardrail-nodes.ts` |
| DB writes | `src/recorder.ts` + core mappers |
| Env vars | `src/config.ts`, `.env.example`, `docs/local-dev.md` |

## Cross-links

[README](README.md) · [docs](docs/main.md) · [core](../../packages/core/CLAUDE.md) ·
[api](../../apps/api/CLAUDE.md) · [web](../../apps/web/CLAUDE.md) · [AGENTS](../../AGENTS.md)
