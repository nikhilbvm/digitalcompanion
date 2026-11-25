# System architecture

Digital Companion is four TypeScript workspaces plus managed services. The browser never talks to
the database or the LLM; it talks to the API and to LiveKit Cloud.

```
┌──────────────────────────── Browser ────────────────────────────┐
│ apps/web (Next.js, client components, Capacitor-ready)          │
│  person picker · Talk now · Chat now · End · live transcript    │
│  livekit-client                          fetch + SSE            │
└──────────────┬──────────────────────────────────┬───────────────┘
               │ LiveKit Cloud media              │ HTTPS
               ▼                                  ▼
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ apps/agent                   │      │ apps/api (Express 5)         │
│  LiveKit worker              │      │  POST /chat (SSE)            │
│  Deepgram Nova-3 STT         │      │  POST /livekit/token         │
│  CompanionOpenRouterLLM      │      │  GET/POST /people            │
│  Deepgram Aura-2 TTS         │      │  GET /conversations[/:id]    │
│  Silero VAD + turn detector  │      │  POST /conversations/:id/end │
│  guardrails + recorder       │      │  guardrails + persistence    │
└──────────────┬───────────────┘      └──────────────┬───────────────┘
               │ service role key                    │ service role key
               └────────────────┬────────────────────┘
                                ▼
                 ┌────────────────────────────────┐
                 │ Postgres (local / RDS)         │
                 │ people · conversations         │
                 │ messages · guardrail_flags     │
                 │ memory_notes                   │
                 └────────────────────────────────┘

Shared: packages/core — persona, guardrails, types, Postgres pool, memory helpers.
External: OpenRouter → Anthropic (chat + classifier; direct Anthropic optional), Deepgram (STT/TTS),
LiveKit Cloud (media + dispatch).
```

## Responsibilities

| Component | Owns | Must not |
|---|---|---|
| `apps/web` | Screens, accessibility, LiveKit client, SSE consumption, admin UI | Hold server secrets, use server-only Next features, write to the database |
| `apps/api` | HTTP contract, SSE, token creation, persistence, OpenRouter/Anthropic text calls | Contain voice-pipeline logic, import LiveKit agent code |
| `apps/agent` | Voice room lifecycle, STT/LLM/TTS hooks, voice turn persistence | Serve HTTP, import API routes |
| `packages/core` | Persona, guardrails, shared types, Postgres pool, memory helpers | Import an app, import LiveKit, use browser APIs |
| `db` | Schema, indexes, RLS | Contain application logic |
| `devops` / `.github` | CI, artifacts, environments, Part 2 deployment | Hold secrets in git |

Dependency direction is one-way: `apps/* → packages/core`. The web app imports only type-only
subpaths (`@companion/core/types`) so server code never enters the browser bundle.

## Text chat flow

1. Browser `POST /chat` with `{ personId, conversationId?, message }`.
2. API validates with Zod, loads the person and conversation (creating a new conversation if ended
   or absent).
3. Deterministic input patterns run immediately; the Haiku classifier starts in parallel.
4. The masked user message is persisted with input flags; `meta` + `flag` SSE events go out.
5. API streams Claude with the cached persona + profile (+ per-turn safety instruction).
6. Each complete sentence passes the output filter before a `delta` event is emitted.
7. A late classifier hit can append a deterministic safety line; `refusal` appends the gentle
   fallback.
8. Safe assistant text and output flags are persisted; `done` closes the stream; latency is logged.

Contract detail: [apps/api/docs/chat-stream.md](../../apps/api/docs/chat-stream.md).

## Voice flow

1. Browser requests a token from `POST /livekit/token`.
2. API creates/uses a `voice` conversation and mints a LiveKit token whose `roomConfig` dispatches
   the agent named `AGENT_NAME` with `{ personId, conversationId }` metadata.
3. The agent worker receives the job, loads the person, starts an `AgentSession` with Deepgram
   STT/TTS, Silero VAD, the LiveKit turn detector and `CompanionOpenRouterLLM` (default) or
   `CompanionAnthropicLLM` (fallback).
4. Final transcript → input guardrail (patterns + classifier awaited) → per-turn safety instruction
   and masked user message persisted → Claude streams → each sentence filtered → Deepgram speaks.
5. Assistant safe text and output flags are persisted by the recorder; latency is logged.
6. On close, `ended_at` is set.

Detail: [voice-pipeline.md](voice-pipeline.md) and
[apps/agent/docs/voice-pipeline.md](../../apps/agent/docs/voice-pipeline.md).

## Failure modes and behavior

| Failure | Behavior |
|---|---|
| Database not configured | `/health` works; data routes return 503 `not_configured`; SSE `/chat` returns 503 JSON before streaming |
| LLM key missing | `/chat` 503; agent exits at startup with the missing variable names |
| Deepgram/LiveKit missing | agent exits at startup; text chat still works if the LLM and database are set |
| Classifier timeout/error | degrades to `none`; deterministic patterns still apply; reply is not blocked |
| LLM refusal | gentle fallback line is emitted and persisted |
| Client disconnects mid-chat | request aborts; partial safe reply is persisted; no error event |
| LiveKit room disconnect | web shows ended; agent recorder closes the conversation |
| Persistence error | logged; voice conversation continues (DB errors never cut audio) |
| TTS filter triggered | unsafe sentence replaced with `Let's talk about something else.`; output flag saved |

## Part 2 evolution

`apps/api` keeps `createApp()` separate from `listen()` so it can move behind API Gateway/Lambda.
`apps/agent` already runs as a container-friendly worker. Terraform, ECS/Lambda, secrets and
observability are designed in [../planning/02-part2-roadmap.md](../planning/02-part2-roadmap.md) and
[../devops.md](../devops.md).
