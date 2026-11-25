# Voice pipeline

Implementation: [`apps/agent/`](../../apps/agent/). API contract:
[`apps/api/docs/main.md`](../../apps/api/docs/main.md).

---

## End-to-end lifecycle

```
web: Talk now
  → getUserMedia (permission)
  → POST /livekit/token {personId, conversationId?}
      api creates/uses voice conversation, mints AccessToken
      token.roomConfig.agents = [RoomAgentDispatch{ agentName: 'dc',
                                                     metadata: {personId, conversationId} }]
  → room.connect(LIVEKIT_URL, token)
  → room.localParticipant.setMicrophoneEnabled(true)
      LiveKit creates the room and dispatches the named worker
  → agent job starts
      parse ctx.job.metadata
      load person from Postgres
      build system text (persona + profile)
      AgentSession (Deepgram STT/TTS, Silero VAD, inference.TurnDetector, CompanionAnthropicLLM)
      session.start({ agent, room: ctx.room })
      session.generateReply(greeting by preferred name)
  → user speaks → STT → final transcript
      onUserTurnCompleted:
        runInputGuardrail (patterns + classifier awaited)
        mask identifiers in the ChatMessage
        persist masked user message + input flags
        llm.setTurnInstruction(per-turn safety line)
  → CompanionOpenRouterLLM (or CompanionAnthropicLLM) streams text
      persona/profile system blocks (persona cached)
      output_config.effort = low
      stop_reason checked; refusal → gentle fallback
  → llmNode:
      sentence filter replaces unsafe sentences before LiveKit builds the
      assistant message (so chat context + live transcript are safe too)
      safe text + output flags persisted
  → ttsNode:
      second safety layer (covers any non-LLM `say` text)
      default TTS node (Deepgram Aura-2)
      first audio frame timestamped for latency
  → LiveKit Cloud → browser
      lk.transcription text streams update the large-type transcript
  → End or disconnect:
      room.disconnect
      agent session Close → ended_at
      web POST /conversations/:id/end (idempotent)
```

---

## Why explicit dispatch

`ServerOptions.agentName = AGENT_NAME` (default `dc`) enables explicit dispatch: the worker
does **not** join every room. The token endpoint attaches the dispatch request to the joining
participant's room configuration, so the agent joins exactly the intended room and receives the
person/conversation metadata in the job.

Dispatch metadata is the only trusted source of `personId`/`conversationId`; the agent never trusts
browser-provided IDs beyond that token minted by the API.

---

## Models and session settings

| Piece | Choice | Notes |
|---|---|---|
| STT | Deepgram `nova-3`, `en-US` | `DEEPGRAM_API_KEY`; interim results on |
| TTS | Deepgram Aura-2, default `aura-2-andromeda-en`, 24 kHz | Voice configurable via `VOICE_TTS_MODEL` |
| VAD | Silero (`@livekit/agents-plugin-silero`) | Loaded per job; small and local |
| Turn detection | `inference.TurnDetector()` | Recommended default; needs LiveKit Cloud |
| Interruption | adaptive, false-interruption resume | `session.interrupt()` on End/cleanup |
| LLM | OpenRouter `anthropic/claude-haiku-5.5` (default) or direct `claude-haiku-5-5`, effort low, max 300 | Custom adapters, no sampling params |

Fallback: if the turn detector is unavailable on the LiveKit plan, set
`turnHandling.turnDetection = 'stt'` in `apps/agent/src/main.ts`. Deepgram endpointing is 25 ms by
default.

---

## Custom LLM adapters

`CompanionOpenRouterLLM` ([`apps/agent/src/llm/openrouter.ts`](../../apps/agent/src/llm/openrouter.ts))
is the default. It uses OpenRouter's OpenAI-compatible streaming API and:

- maps `ChatContext` to OpenAI-style messages (merges same-role turns, guarantees a leading user turn);
- puts Anthropic-style `cache_control` on the stable system block and appends the per-turn safety
  instruction after it;
- sends `reasoning.effort` low and `max_tokens` 300, no sampling params, no prefill;
- pins the `anthropic` provider with fallbacks off and `data_collection: deny`;
- detects `finish_reason`, `native_finish_reason: refusal` and `delta.refusal`, then emits the gentle
  fallback;
- reports prompt/cache/completion usage to LiveKit metrics.

`CompanionAnthropicLLM` ([`apps/agent/src/llm/anthropic.ts`](../../apps/agent/src/llm/anthropic.ts))
is the direct fallback (`LLM_PROVIDER=anthropic`). It is adapted from the Apache-2.0 LiveKit Anthropic
plugin and uses the native Messages API with `output_config.effort`, per-block `cache_control` and
`stop_reason: refusal`.

Both are tool-free in Part 1. Adding tools means mapping `tool_use`/`tool_result` (or OpenAI tool
calls) and keeping the cache breakpoint placement intact.

---

## Guardrail hooks

| Hook | Runs | Effect |
|---|---|---|
| `onUserTurnCompleted` | after final transcript, before LLM | awaited input guardrail, mask, persist user turn + flags, set turn instruction |
| `llmNode` | around the LLM stream | sentence-level output filter before LiveKit builds the assistant message; persist safe assistant text + flags |
| `ttsNode` | before synthesis | second output-filter layer for non-LLM text; timestamp first audio |
| AgentSession `Error` | any session error | log to console (no message text) |
| AgentSession `Close` | end of call | `ended_at` |

The input classifier is awaited in voice because safety instructions must be in the prompt for the
turn. This costs roughly 0.5–2.5 seconds; it is measured and reported in the latency log.

---

## Persistence

`Recorder` writes:

- user turn: masked text, role `user`, input flags with `message_id`
- assistant turn: **spoken/filtered** text, role `assistant`, output flags
- conversation end: `ended_at`

Database failures are logged and swallowed; they never cut the audio pipeline.

---

## Latency

Logged as JSON on each turn:

```json
{"event":"voice_turn","conversationId":"…","speechToFirstAudioMs":1234,"guardrailMs":420}
```

Sources of delay: STT finalization, turn detection, input guardrail (classifier), Claude
time-to-first-token, sentence buffering, TTS time-to-first-byte.

Tuning order if the demo is slow:

1. Confirm `output_config.effort: low` and `max_tokens` 300 are in effect.
2. Shorten the classifier prompt/timeout; patterns alone are faster but less nuanced.
3. Disable awaited classifier for low-risk turns (not implemented; requires a documented safety
   review).
4. Choose a lower-latency Aura-2 voice; verify with a listening test.
5. Use preemptive generation only if the persona and guardrail design still hold.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Worker starts but never joins | `AGENT_NAME` mismatch between `.env` and token; dispatch metadata invalid; LiveKit URL/key wrong |
| Agent joins, no audio | Deepgram key missing/invalid; TTS model unavailable; mic permission denied |
| User audio but no reply | classifier/LLM key missing; check agent logs for `[guardrail]` / LiveKit LLM errors |
| Reply cut off | max tokens; interruption; output filter replacing sentences (expected) |
| Transcript missing | text stream handler not registered before join, or LiveKit text streams disabled |
| "Session error" in console | inspect `AgentSessionEventTypes.Error` log; never log transcript text |
| Conversation stays active | Close event did not fire; check `ended_at` and call the end endpoint manually |

---

## Manual test

1. `pnpm dev`, open `/admin`, create a person with a preferred name and interests.
2. On `/`, pick the person, **Talk now**, allow the mic.
3. Expect a greeting by preferred name; say "I like gardening" and hear a follow-up.
4. Say "I fell and can't get up" → 911 guidance within the reply; an emergency flag appears in
   `/admin`.
5. Interrupt while the companion is speaking → it stops.
6. **End** → transcript remains; conversation shows ended in admin.
