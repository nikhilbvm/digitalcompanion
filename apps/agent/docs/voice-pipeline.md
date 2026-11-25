# Voice pipeline — app-level detail

This complements [docs/architecture/voice-pipeline.md](../../../docs/architecture/voice-pipeline.md)
with the exact files and hooks in this app.

## Files

| File | Responsibility |
|---|---|
| `src/main.ts` | `defineAgent`, metadata, person load, `AgentSession`, greeting, close |
| `src/companion-agent.ts` | `onUserTurnCompleted` (input guardrail), `llmNode` (output filter + persistence), `ttsNode` (second filter layer + latency) |
| `src/llm/anthropic.ts` | `CompanionAnthropicLLM` + stream, request policy |
| `src/guardrail-nodes.ts` | `filterLlmStream`, `filterTextForTts`, `tapFirstAudio` |
| `src/recorder.ts` | Postgres user/assistant messages, flags, `ended_at` |
| `src/config.ts` | env, `assertAgentConfig` |

## Turn timeline

```
t0  user stops speaking (VAD)
t1  final transcript (Deepgram)
t2  onUserTurnCompleted starts
t3  guardrail done (patterns sync + classifier await)
t4  Claude first token
t5  llmNode filters the first complete sentence → context/transcript/TTS
t6  TTS second-layer filter, first audio frame (logged)
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

The **LLM stream** is filtered in `llmNode` before LiveKit builds the assistant message. That is the
primary layer: the chat context, the live transcription, TTS and the recorder all receive safe text.
The filter accumulates the safe reply and persists it when the stream completes. `ttsNode` applies the
same filter again as a second layer for any non-LLM `say` text; it only writes a message if that layer
actually catches something, so normal replies are not duplicated.

This ordering matters: filtering only at TTS would leave raw unsafe text in the chat context and the
live transcript even though the audio was safe.

## Adding tools

The companion is tool-free. If adding a tool:

1. Implement tool mapping in the adapter (`tool_use`/`tool_result` blocks).
2. Do not move the cache breakpoint off the persona.
3. Keep the tool result free of identifiers.
4. Add guardrail tests for any new action (e.g. never book/pay/send without explicit design review).
