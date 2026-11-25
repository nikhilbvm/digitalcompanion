# Voice agent — design notes

The worker is a LiveKit Agents JS server with explicit dispatch. It never listens on HTTP; it joins
rooms when the API's token asks for it.

## Worker lifecycle

```
cli.runApp(ServerOptions{ agent: dist/main.js, agentName: AGENT_NAME })
  → registers with LiveKit Cloud
  → waits for dispatched jobs
  → job: entry(ctx)
      metadata = JSON.parse(ctx.job.metadata)
      person = supabase.people.select('*').eq('id', metadata.personId)
      agent = CompanionAgent{ instructions: buildSystemText(person), llm }
      session = AgentSession{ stt, llm, tts, vad, turnHandling }
      session.on(Close) → recorder.endConversation()
      session.start({ agent, room: ctx.room })
      session.generateReply(greeting by preferred name)
      await close
```

## Session settings

| Setting | Value |
|---|---|
| STT | `deepgram.STT({ model: nova-3, language: en-US })` |
| TTS | `deepgram.TTS({ model: aura-2-andromeda-en, sampleRate: 24000 })` |
| VAD | `silero.VAD.load()` |
| Turn detection | `new inference.TurnDetector()` |
| Interruptions | adaptive, false-interruption resume (1s) |

If `inference.TurnDetector()` is unavailable on the LiveKit plan, set `turnDetection: 'stt'`.

## Agent hooks

```ts
onUserTurnCompleted(chatCtx, newMessage):
  text = newMessage.rawTextContent
  result = await runInputGuardrail(text)
  if masked !== text → newMessage.content = [masked]
  recorder.recordUser(text, result.hits)
  llm.setTurnInstruction(result.safetyInstruction)

ttsNode(text, settings):
  filtered = filterTextForTts(text, recordAssistant)
  audio = Agent.default.ttsNode(this, filtered, settings)
  return tapFirstAudio(audio, log latency)
```

## Custom LLM adapter

`src/llm/anthropic.ts` is adapted from the Apache-2.0 LiveKit Anthropic plugin. Differences:

- `output_config: { effort }` (low) and `max_tokens` 300.
- `cache_control: { type: "ephemeral" }` on the first system block (persona).
- Per-turn safety instruction after the cache breakpoint, consumed once.
- Refusal → `REFUSAL_FALLBACK` text chunk when no text was emitted.
- No sampling parameters, no prefill.
- Tools are not mapped in Part 1.

## Persistence

`Recorder` writes user and assistant messages + flags; masks text defensively; catches and logs
errors. `ended_at` is set when the session closes.

## Latency

`voice_turn` JSON log: `conversationId`, `speechToFirstAudioMs`, `guardrailMs`. No transcript content.

## Troubleshooting

| Symptom | Check |
|---|---|
| Worker exits at startup | missing env list printed by `assertAgentConfig` |
| Worker never joins | `AGENT_NAME`, LiveKit URL/keys, dispatch metadata |
| No greeting | person not found; room not connected; TTS key/model |
| No reply | classifier/LLM errors; check `[guardrail]` and session Error logs |
| No transcript in web | agent output transcription disabled; text stream handler registration |
| Conversation not ended | Close event path; `POST /conversations/:id/end` |

Back to [README](../README.md) · [root docs](../../../docs/main.md)
