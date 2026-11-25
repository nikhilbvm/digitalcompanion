# @companion/api

Express 5 API for Digital Companion: streaming text chat, LiveKit access tokens, people and
conversation data for the admin page.

## Commands

```bash
pnpm --filter @companion/api dev        # tsx watch, :4000
pnpm --filter @companion/api build      # tsup → dist (bundles @companion/core)
pnpm --filter @companion/api start      # node dist/index.js
pnpm --filter @companion/api typecheck
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ ok, version, uptime, configured }` |
| POST | `/chat` | SSE text chat: `{ personId, conversationId?, message }` |
| POST | `/livekit/token` | `{ personId, conversationId? }` → token + room + conversation id |
| GET | `/people` | list people |
| POST | `/people` | create person |
| GET | `/conversations?personId=` | list conversations |
| GET | `/conversations/:id` | conversation + person + messages + flags |
| POST | `/conversations/:id/end` | set `ended_at` |

Full contract: [docs/main.md](docs/main.md) · SSE detail:
[docs/chat-stream.md](docs/chat-stream.md).

## Configuration

Reads the root `.env` (and `apps/api/.env` if present). Required: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Voice tokens additionally need `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `AGENT_NAME`. Optional: `API_PORT`, `CORS_ORIGIN`,
`ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `CHAT_HISTORY_LIMIT`, `MAX_REPLY_TOKENS`.

## Structure

```
src/app.ts            createApp() — no listen, Lambda-ready
src/index.ts          listen + graceful shutdown
src/routes/           health, people, conversations, chat, livekit
src/services/
  store.ts            Supabase reads/writes (service role)
  anthropic.ts        streaming request policy
  chat-turn.ts        guardrail → Claude → output filter → persist
src/sse.ts            SSE writer
src/config.ts         env loading + configured-service flags
```

Docs: [docs/main.md](docs/main.md) · Agent file: [CLAUDE.md](CLAUDE.md)
