import type { VoiceSpeaker, VoiceStatus } from '@/lib/livekit';

interface CompanionOrbProps {
  status: VoiceStatus;
  speaker: VoiceSpeaker;
  compact?: boolean;
}

function orbState(status: VoiceStatus, speaker: VoiceSpeaker): string {
  if (status === 'requesting-mic' || status === 'connecting') return 'orb-connecting';
  if (speaker === 'companion') return 'orb-speaking orb-ai-speaking';
  if (speaker === 'user') return 'orb-listening orb-user-speaking';
  if (status === 'speaking') return 'orb-speaking orb-ai-speaking';
  if (status === 'listening') return 'orb-listening';
  return 'orb-idle';
}

export function CompanionOrb({ status, speaker, compact = false }: CompanionOrbProps) {
  return (
    <div
      className={`companion-orb ${compact ? 'companion-orb-compact' : 'companion-orb-large'} ${orbState(status, speaker)}`}
      aria-hidden="true"
    >
      <span className="orb-ring orb-ring-one" />
      <span className="orb-ring orb-ring-two" />
      <span className="orb-ring orb-ring-three" />
      <div className="orb-core">
        {speaker === 'companion' || status === 'speaking' ? (
          <span className="wave-bars">
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
            <span className="wave-bar" />
          </span>
        ) : (
          <span className="orb-glow" />
        )}
      </div>
    </div>
  );
}
