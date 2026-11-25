'use client';

import { Room, RoomEvent } from 'livekit-client';
import { endConversation, getLivekitToken } from './api';

export type VoiceStatus =
  | 'idle'
  | 'requesting-mic'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'ended'
  | 'error';

export interface TranscriptLine {
  id: string;
  speaker: 'you' | 'companion';
  text: string;
  final: boolean;
}

export interface VoiceSessionHandlers {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  onConversationId: (conversationId: string) => void;
  onError: (message: string) => void;
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

  async start(
    personId: string,
    handlers: VoiceSessionHandlers,
    existingConversationId?: string,
  ): Promise<void> {
    this.lines.clear();
    handlers.onTranscript([]);
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
        if (remoteSpeaking) handlers.onStatus('speaking');
        else if (localSpeaking) handlers.onStatus('listening');
        else handlers.onStatus('listening');
      });

      room.on(RoomEvent.Disconnected, () => {
        handlers.onStatus('ended');
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (participant.identity !== room.localParticipant.identity) {
          handlers.onStatus('ended');
        }
      });

      await room.connect(token.url, token.token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);
      handlers.onStatus('listening');
    } catch (error) {
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
