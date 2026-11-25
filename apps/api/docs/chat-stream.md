# Text chat turn

Implementation: `src/services/chat-turn.ts`, `src/services/anthropic.ts`, `src/routes/chat.ts`.

```
POST /chat {personId, conversationId?, message}
  │
  ├─ validate Zod; check database + Anthropic configured (503 before SSE)
  ├─ load person; load/created conversation (new if ended/absent)
  ├─ checkInputPatterns(message)            ← synchronous; maskedText
  ├─ save user message (masked) + input flags
  ├─ emit meta, flag events
  ├─ start classifyInput(maskedText) in parallel
  ├─ build system = persona(cached) + profile [+ per-turn safety instruction]
  ├─ messages = last N history + current masked turn
  ├─ stream Claude (effort low, max_tokens)
  │    └─ SentenceAccumulator → filterOutputSentence → delta event
  ├─ await classifier (≤600ms after reply; usually already done)
  │    └─ if severity raised: extra flag + deterministic safety line
  ├─ stop_reason refusal → REFUSAL_FALLBACK delta
  ├─ empty reply → EMPTY_REPLY delta
  ├─ save assistant safe text + output flags
  └─ emit done; close; log {ttftMs,totalMs,counts}
```

## Why the classifier is parallel

Text chat should feel immediate. The deterministic patterns cover the critical scam/emergency cases,
so the classifier is allowed to finish mid-reply. If it raises severity, the API appends a fixed
safety line and records the flag; it never invents one with the model.

Voice differs: `onUserTurnCompleted` awaits the classifier because the safety instruction must be in
the prompt for that turn. See [../../agent/docs/voice-pipeline.md](../../agent/docs/voice-pipeline.md).

## SSE framing

```
event: meta
data: {"conversationId":"…","mode":"text","category":"none"}

event: delta
data: {"text":"Hello Mary. "}

event: flag
data: {"stage":"input","category":"scam","detail":"payment card number detected","source":"pattern"}

event: done
data: {"conversationId":"…","category":"scam","stopReason":"end_turn"}
```

Frames are separated by a blank line. Data is a single-line JSON object, so text newlines are escaped
and cannot break framing. The client parser is `apps/web/src/lib/api.ts`.

## Failure behavior

| Case | Result |
|---|---|
| Client closes | AbortController aborts Claude; partial safe text persisted; no error event |
| Anthropic error | `error` event; partial safe text persisted |
| Database write fails after stream | `error` event; text may be lost (logged) |
| Classifier slow | skipped after 600ms; pattern flags already persisted |
| Refusal | fallback line persisted as the assistant message |
| Empty response | `EMPTY_REPLY` persisted |

## Invariants

- Only filtered text is sent to the browser and persisted.
- The card/SSN/OTP/Medicare number never appears in `messages` or `guardrail_flags`.
- The current user turn sent to Claude is the **masked** text.
- History is capped; the DB keeps everything.
