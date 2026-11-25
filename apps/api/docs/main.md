# API — contract

Base URL locally: `http://localhost:4000`. JSON bodies; errors are
`{ error: code, message?, issues? }`.

## Health

```http
GET /health
200 {"ok":true,"version":"0.1.0","uptime":12.3,
     "configured":{"anthropic":true,"deepgram":true,"livekit":true,"supabase":true}}
```

`configured` is booleans only; it never reveals values. Use it first when debugging.

## People

```http
GET /people
200 {"people":[{"id":"…","name":"Mary Example","preferredName":"Mary",
      "interests":["gardening"],"avoidTopics":["politics"],
      "careNotes":"…","createdAt":"…"}]}

POST /people
{"name":"Mary Example","preferredName":"Mary","interests":["gardening"],
 "avoidTopics":["politics"],"careNotes":"optional"}
201 {"person":{…}}
400 bad_request (Zod issues)
```

## Conversations

```http
GET /conversations?personId=<uuid>
200 {"conversations":[{id,personId,mode,startedAt,endedAt}]}

GET /conversations/:id
200 {"conversation":{…},"person":{…},"messages":[…],"flags":[…]}

POST /conversations/:id/end
200 {"conversation":{…}}   // endedAt set; idempotent
```

`GET /conversations/:id` is what `/admin` uses. Messages and flags are stored masked.

## Chat (SSE)

```http
POST /chat
Content-Type: application/json

{"personId":"<uuid>","conversationId":"<uuid optional>","message":"hello"}
```

Response: `text/event-stream`, one JSON object per `data:` line.

| Event | Data | Meaning |
|---|---|---|
| `meta` | `{conversationId, mode:"text", category}` | conversation resolved/created |
| `delta` | `{text}` | safe reply text (already output-filtered) |
| `flag` | `{stage,category,detail,source?}` | a guardrail hit |
| `done` | `{conversationId,category,stopReason}` | turn complete; stream closes |
| `error` | `{message}` | turn failed; stream closes |

Rules:

- `delta` text is already safe to render. Never render raw model output.
- The user message is persisted before generation; the assistant message is persisted after the stream
  (or partial text on failure).
- If the client disconnects, generation is aborted and any partial safe reply is persisted.
- Missing config returns HTTP 503 JSON **before** the SSE stream starts.
- Detail: [chat-stream.md](chat-stream.md).

## LiveKit token

```http
POST /livekit/token
{"personId":"<uuid>","conversationId":"<uuid optional>"}
200 {"token":"…","url":"wss://…","roomName":"companion-<conversationId>",
     "conversationId":"…"}
```

Creates a `voice` conversation unless a matching, active voice conversation is supplied. The token
includes `RoomConfiguration.agents = [{ agentName: AGENT_NAME, metadata: {personId, conversationId} }]`,
so connecting dispatches the worker.

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | Zod validation failed |
| 404 | `not_found` | person/conversation missing or wrong person |
| 503 | `not_configured` | Supabase/Anthropic/LiveKit env missing |
| 500 | `internal_error` | unexpected server error (message hidden) |

## Request policy (Anthropic)

`claude-haiku-5-5`; `output_config.effort` from `ANTHROPIC_EFFORT` (default low); no sampling
parameters; no assistant prefill; `cache_control` on the persona block; `stop_reason` checked,
including `refusal` → `REFUSAL_FALLBACK`.

## Persistence

`src/services/store.ts` is the only writer. It masks `messages.text` again defensively and masks flag
detail. Conversation history for the LLM is capped by `CHAT_HISTORY_LIMIT` (default 20 messages).

## Tests / checks

```bash
pnpm --filter @companion/api typecheck
pnpm --filter @companion/api build
curl -s http://localhost:4000/health | jq
curl -s -X POST http://localhost:4000/chat -H 'content-type: application/json' \
  -d '{"personId":"<uuid>","message":"my card is 4111 1111 1111 1111"}'
```

Back to [README](../README.md) · [root docs](../../../docs/main.md)
