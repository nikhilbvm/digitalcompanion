# Voice pipeline — app-level detail

This complements [docs/architecture/voice-pipeline.md](../../../docs/architecture/voice-pipeline.md)
with the exact files and hooks in this app.

## Files

| File | Responsibility |
|---|---|
| `src/main.ts` | `defineAgent`, metadata, person load, `AgentSession`, greeting, close |
| `src/companion-agent.ts` | `onUserTurnCompleted` (input guardrail), `ttsNode` (output filter, persistence, latency) |
| `src/llm/anthropic.ts` | `CompanionAnthropicLLM` + stream, request policy |
| `src/guardrail-nodes.ts` | `filterTextForTts`, `tapFirstAudio` |
| `src/recorder.ts` | user/assistant messages, flags, `ended_at` |
| `src/config.ts` | env, `assertAgentConfig` |

## Turn timeline

```
t0  user stops speaking (VAD)
t1  final transcript (Deepgram)
t2  onUserTurnCompleted starts
t3  guardrail done (patterns sync + classifier await)
t4  Claude first token
t5  first complete sentence filtered → TTS starts
t6  first audio frame (logged)
```

`speechToFirstAudioMs = t6 - finalTranscript.createdAt`; `guardrailMs = t3 - t2`. If t3 is much larger
than the rest, the classifier is the bottleneck.

## Why the safety instruction is not in chat history

`llm.setTurnInstruction()` stores it on the LLM instance; the next `chat()` appends it as a temporary
system block and clears it. It never accumulates in `ChatContext`, so later turns are not biased by a
previous emergency/scam instruction.

## Why identifiers are masked in the ChatMessage

The final transcript lives in the chat context. If the person reads a card number aloud, the model
could otherwise repeat it. `onUserTurnCompleted` replaces the message content with the masked text
before the LLM call; the recorder stores masked text too.

## Output filtering and persistence ordering

The TTS text stream is filtered before `Agent.default.ttsNode`. The generator accumulates safe text
and persists it when the stream completes (or in `finally` on barge-in). The raw assistant ChatMessage
remains in the LLM context; the user never hears it, and the DB does not receive it. Part 2 may add a
context scrub if this causes follow-up issues.

## Adding tools

The companion is tool-free. If adding a tool:

1. Implement tool mapping in the adapter (`tool_use`/`tool_result` blocks).
2. Do not move the cache breakpoint off the persona.
3. Keep the tool result free of identifiers.
4. Add guardrail tests for any new action (e.g. never book/pay/send without explicit design review).
