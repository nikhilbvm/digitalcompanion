import type { TranscriptLine, VoiceStatus } from '@/lib/livekit';
import { BigButton } from './BigButton';

interface VoicePanelProps {
  status: VoiceStatus;
  transcript: TranscriptLine[];
  audioBlocked: boolean;
  onEnableAudio: () => void;
  onEnd: () => Promise<void> | void;
}

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: 'Ready when you are.',
  'requesting-mic': 'Asking for your microphone…',
  connecting: 'Connecting…',
  listening: 'Listening…',
  speaking: 'Your companion is speaking…',
  ended: 'The conversation has ended.',
  error: 'Something went wrong.',
};

export function VoicePanel({ status, transcript, audioBlocked, onEnableAudio, onEnd }: VoicePanelProps) {
  return (
    <section className="flex w-full flex-col gap-5">
      <div
        className="rounded-2xl border-2 border-teal-200 bg-white/80 p-6 text-center text-3xl font-semibold text-teal-900"
        role="status"
        aria-live="polite"
      >
        {STATUS_TEXT[status]}
      </div>

      <div
        className="flex max-h-[52vh] min-h-[220px] flex-col gap-3 overflow-y-auto rounded-2xl border-2 border-slate-300 bg-white/80 p-5"
        aria-live="polite"
      >
        {transcript.length === 0 ? (
          <p className="text-2xl text-slate-600">
            Your conversation will appear here in large text.
          </p>
        ) : null}

        {transcript.map((line) => (
          <p
            key={line.id}
            className={`text-2xl leading-relaxed ${
              line.speaker === 'you' ? 'text-slate-900' : 'text-teal-900'
            } ${line.final ? '' : 'opacity-70'}`}
          >
            <span className="font-semibold">
              {line.speaker === 'you' ? 'You' : 'Companion'}:
            </span>{' '}
            {line.text}
          </p>
        ))}
      </div>

      {audioBlocked ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-2xl text-amber-950">
            Your browser blocked sound. Tap to hear your companion.
          </p>
          <BigButton variant="quiet" onClick={onEnableAudio}>
            Enable sound
          </BigButton>
        </div>
      ) : null}

      <div>
        <BigButton variant="end" onClick={() => void onEnd()}>
          End
        </BigButton>
      </div>
    </section>
  );
}
