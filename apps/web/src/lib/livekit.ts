'use client';

import { Room, RoomEvent, Track } from 'livekit-client';
import { endConversation, getLivekitToken } from './api';

export type VoiceStatus =
  | 'idle'
  | 'requesting-mic'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'ended'
  | 'error';

export type VoiceSpeaker = 'user' | 'companion' | null;

export interface TranscriptLine {
  id: string;
  speaker: 'you' | 'companion';
  text: string;
  final: boolean;
}

export interface VoiceSessionHandlers {
  onStatus: (status: VoiceStatus) => void;
  onSpeaker?: (speaker: VoiceSpeaker) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  onConversationId: (conversationId: string) => void;
  onError: (message: string) => void;
  /** True when the browser blocked autoplay and the user must tap Enable sound. */
  onAudioBlocked?: (blocked: boolean) => void;
}

/**
 * Thin wrapper around a LiveKit room for the companion POC:
 * - asks for mic permission
 * - gets a token that dispatches the named agent
 * - displays `lk.transcription` text streams
 * - maps active speakers to "Listening..." / "Companion is speaking..."
 */
export class VoiceSession {
  private room: Room | null = null;
  private conversationId: string | null = null;
  private lines = new Map<string, TranscriptLine>();
  private audioElements = new Set<HTMLMediaElement>();
  private handlers: VoiceSessionHandlers | null = null;

  async start(
    personId: string,
    handlers: VoiceSessionHandlers,
    existingConversationId?: string,
  ): Promise<void> {
    this.lines.clear();
    this.handlers = handlers;
    handlers.onTranscript([]);
    handlers.onSpeaker?.(null);
    handlers.onAudioBlocked?.(false);
    handlers.onStatus('requesting-mic');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch {
      handlers.onStatus('error');
      handlers.onError(
        'I could not hear your microphone. Please allow microphone access and try again.',
      );
      return;
    }

    handlers.onStatus('connecting');

    try {
      const token = await getLivekitToken(personId, existingConversationId);
      this.conversationId = token.conversationId;
      handlers.onConversationId(token.conversationId);

      const room = new Room();
      this.room = room;

      room.registerTextStreamHandler('lk.transcription', async (reader) => {
        let message: string;
        try {
          message = await reader.readAll();
        } catch {
          return;
        }
        if (!message.trim()) return;

        const attributes = reader.info.attributes ?? {};
        const segmentId =
          attributes['lk.segment_id'] ??
          `seg-${reader.info.timestamp}-${Math.random().toString(36).slice(2)}`;
        const speaker: TranscriptLine['speaker'] = attributes['lk.transcribed_track_id']
          ? 'you'
          : 'companion';
        const final = attributes['lk.transcription_final'] === 'true';

        this.lines.set(segmentId, { id: segmentId, speaker, text: message, final });
        handlers.onTranscript(Array.from(this.lines.values()));
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const localIdentity = room.localParticipant.identity;
        const localSpeaking = speakers.some((p) => p.identity === localIdentity);
        const remoteSpeaking = speakers.some((p) => p.identity !== localIdentity);
        if (remoteSpeaking) {
          handlers.onStatus('speaking');
          handlers.onSpeaker?.('companion');
        } else if (localSpeaking) {
          handlers.onStatus('listening');
          handlers.onSpeaker?.('user');
        } else {
          handlers.onStatus('listening');
          handlers.onSpeaker?.(null);
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.style.display = 'none';
        document.body.appendChild(element);
        this.audioElements.add(element);
        element.play().catch(() => handlers.onAudioBlocked?.(true));
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const element of track.detach()) {
          element.remove();
          this.audioElements.delete(element);
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        handlers.onAudioBlocked?.(!room.canPlaybackAudio);
      });

      room.on(RoomEvent.Disconnected, () => {
        handlers.onSpeaker?.(null);
        handlers.onStatus('ended');
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (participant.identity !== room.localParticipant.identity) {
          handlers.onSpeaker?.(null);
          handlers.onStatus('ended');
        }
      });

      await room.connect(token.url, token.token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);

      // Remote audio is attached above; this unlocks playback if the browser
      // requires a user gesture. If it fails, the UI offers Enable sound.
      try {
        await room.startAudio();
      } catch {
        handlers.onAudioBlocked?.(true);
      }
      handlers.onAudioBlocked?.(!room.canPlaybackAudio);
      handlers.onSpeaker?.(null);
      handlers.onStatus('listening');
    } catch (error) {
      handlers.onSpeaker?.(null);
      handlers.onStatus('error');
      handlers.onError(
        error instanceof Error
          ? `I could not start the voice call: ${error.message}`
          : 'I could not start the voice call.',
      );
      // Also closes the conversation row created by the token request.
      await this.end();
    }
  }

  async enableAudio(): Promise<void> {
    if (!this.room) return;
    try {
      await this.room.startAudio();
      this.handlers?.onAudioBlocked?.(!this.room.canPlaybackAudio);
    } catch {
      this.handlers?.onAudioBlocked?.(true);
    }
  }

  async end(): Promise<void> {
    if (this.conversationId) {
      try {
        await endConversation(this.conversationId);
      } catch {
        // ending the call locally matters more than the bookkeeping row
      }
    }
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    for (const element of this.audioElements) element.remove();
    this.audioElements.clear();
    const room = this.room;
    this.room = null;
    if (!room) return;
    try {
      room.unregisterTextStreamHandler('lk.transcription');
    } catch {
      // ignore
    }
    await room.disconnect();
  }
}
