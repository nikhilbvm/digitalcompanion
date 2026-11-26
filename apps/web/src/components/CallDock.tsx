'use client';

import type { VoiceStatus } from '@/lib/livekit';
import { PhoneIcon, PhoneOffIcon } from './Icons';

interface CallDockProps {
  hasPerson: boolean;
  status: VoiceStatus;
  onCall: () => void;
  onEnd: () => void;
}

export function CallDock({ hasPerson, status, onCall, onEnd }: CallDockProps) {
  const connecting = status === 'requesting-mic' || status === 'connecting';
  const active = status === 'listening' || status === 'speaking';
  const disabled = !hasPerson || connecting;
  const label = connecting ? 'Connecting…' : active ? 'End call' : hasPerson ? 'Call' : 'Choose someone';

  return (
    <div className="call-dock border-t border-slate-200/80 bg-[#fffdf8]/90 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        <button
          type="button"
          onClick={active ? onEnd : onCall}
          disabled={disabled}
          aria-label={label}
          className={`call-button ${active ? 'call-button-end' : 'call-button-start'} ${
            disabled ? 'call-button-disabled' : ''
          }`}
        >
          {active ? <PhoneOffIcon className="h-8 w-8" /> : <PhoneIcon className="h-8 w-8" />}
        </button>
        <span className="text-sm font-semibold tracking-wide text-slate-600">{label}</span>
      </div>
    </div>
  );
}
