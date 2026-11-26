# Voice UI

Implementation: `src/lib/livekit.ts`, `src/components/CompanionOrb.tsx`,
`src/components/CallDock.tsx`, `src/components/ChatPane.tsx`.

## Connection sequence

```
Call
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
early transcription streams would otherwise be missed. Starting a voice call ends any active text
conversation first.

## Orb and call dock

- `CompanionOrb` receives `VoiceStatus` and `VoiceSpeaker`.
- `ActiveSpeakersChanged` maps a remote speaker to `companion` and a local speaker to `user`.
- The orb breathes while idle/listening, pulses rings while the user speaks, and shows animated bars
  while the companion speaks.
- `CallDock` is the only call control: green **Call**, disabled **Connecting…**, or red **End call**.
  It is disabled when no person is selected or while the microphone/room is connecting.

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
- `ChatPane` auto-scrolls the transcript area when chat is enabled.

## Status mapping

| Active speakers | Status | Animation |
|---|---|---|
| remote participant | speaking | companion waveform |
| local participant only | listening | user rings |
| none | listening | breathing orb |

When chat is disabled, the orb is the only stage content. When enabled, a compact orb sits above the
transcript/chat area so the speaking animation remains visible.

## Failure handling

| Failure | UI |
|---|---|
| Mic denied | toast + error status; call can be retried |
| Token/API error | toast + error status |
| Room connect error | toast; cleanup attempted |
| Agent leaves/disconnects | status ended, call returns to idle |
| No transcript | status still reflects speech |

## Privacy

Audio flows browser ↔ LiveKit Cloud ↔ agent. No audio is recorded by our code in Part 1. Transcripts
are stored masked in Postgres by the agent recorder. Do not add client-side analytics that capture
transcript text.
