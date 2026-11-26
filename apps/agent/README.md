# @companion/agent

LiveKit Agents JS voice worker. Deepgram Nova-3 (STT) → Claude Haiku 5.5 → Deepgram Aura-2 (TTS),
with Silero VAD, the LiveKit turn detector, input/output guardrails and turn persistence.

## Commands

```bash
pnpm --filter @companion/agent dev      # tsup build → node dist/main.js dev
pnpm --filter @companion/agent build    # tsup → dist
pnpm --filter @companion/agent start    # node dist/main.js start
pnpm --filter @companion/agent typecheck
```

The worker is built before it runs because LiveKit forks job processes under plain Node; TypeScript
source cannot be used directly in those children.

## Configuration

Required: `DEEPGRAM_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
`DATABASE_URL`, and either `OPENROUTER_API_KEY` (default) or `ANTHROPIC_API_KEY` when
`LLM_PROVIDER=anthropic`.

Optional: `AGENT_NAME` (local dev defaults to `dc-local`; the deployed tenant uses `dc`),
`OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, `LLM_EFFORT`,
`VOICE_MAX_TOKENS`, `VOICE_STT_MODEL` (default `nova-3`), `VOICE_TTS_MODEL` (default
`aura-2-andromeda-en`).

`AGENT_NAME` must match the name used by `POST /livekit/token`.

## How a job starts

1. The API mints a token with `RoomAgentDispatch{ agentName, metadata: {personId, conversationId} }`.
2. The participant joins; LiveKit dispatches the worker.
3. `entry` parses `ctx.job.metadata`, loads the person from Postgres, builds the system text, starts
   `AgentSession`, and greets by preferred name.

## Structure

```
src/main.ts              defineAgent + ServerOptions + cli.runApp
src/companion-agent.ts   Agent subclass: onUserTurnCompleted, llmNode, ttsNode
src/llm/openrouter.ts    OpenRouter llm.LLM/LLMStream (default)
src/llm/anthropic.ts     direct Anthropic adapter (fallback)
src/guardrail-nodes.ts   LLM stream + TTS sentence filtering, first-audio tap
src/recorder.ts          masked turn/flag persistence over Postgres, ended_at
src/config.ts            env loading + required-variable check
```

Docs: [docs/main.md](docs/main.md) · [docs/voice-pipeline.md](docs/voice-pipeline.md) · Agent file:
[CLAUDE.md](CLAUDE.md)
