# Voice UI

Implementation: `src/lib/livekit.ts`, `src/components/VoicePanel.tsx`.

## Connection sequence

```
Talk now
  → getUserMedia({audio:true}) permission; stop temporary tracks
  → POST /livekit/token {personId, conversationId?}
  → new Room()
  → registerTextStreamHandler('lk.transcription', handler)
  → room.on(ActiveSpeakersChanged / Disconnected / ParticipantDisconnected)
  → room.connect(url, token, {autoSubscribe:true})
  → room.localParticipant.setMicrophoneEnabled(true)
  → status = listening
```

Registering the handler before `connect` matters: the agent may greet immediately after joining, and
early transcription streams would otherwise be missed.

## Transcript handling

```ts
room.registerTextStreamHandler('lk.transcription', async (reader) => {
  const message = await reader.readAll();
  const attrs = reader.info.attributes ?? {};
  const segmentId = attrs['lk.segment_id'];
  const speaker = attrs['lk.transcribed_track_id'] ? 'you' : 'companion';
  const final = attrs['lk.transcription_final'] === 'true';
  lines.set(segmentId, { id: segmentId, speaker, text: message, final });
  onTranscript([...lines.values()]);
});
```

- Interim and final streams share `lk.segment_id`; the final replaces the interim.
- User speech has `lk.transcribed_track_id`; agent speech does not.
- If a stream read fails mid-way (sender abort/reconnect), ignore that segment.

## Status mapping

| Active speakers | Status |
|---|---|
| remote participant | speaking |
| local participant only | listening |
| none | listening |

`End` calls `endConversation(conversationId)` then disconnects. The agent also sets `ended_at` on close;
the endpoint is idempotent.

## Failure handling

| Failure | UI |
|---|---|
| Mic denied | status error + "allow microphone access" message |
| Token/API error | status error + API message |
| Room connect error | status error + message; cleanup attempted |
| Agent leaves/disconnects | status ended |
| No transcript | status still reflects speech; check agent output transcription |

## Privacy

Audio flows browser ↔ LiveKit Cloud ↔ agent. No audio is recorded by our code in Part 1. Transcripts
are stored masked in Postgres by the agent recorder. Do not add client-side analytics that capture
transcript text.
