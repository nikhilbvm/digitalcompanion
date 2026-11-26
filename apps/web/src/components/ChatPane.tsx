'use client';

import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@/lib/livekit';
import { SendIcon } from './Icons';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
}

interface ChatPaneProps {
  messages: ChatMessageView[];
  transcript: TranscriptLine[];
  voiceActive: boolean;
  sending: boolean;
  hasPerson: boolean;
  onSend: (text: string) => Promise<void> | void;
}

export function ChatPane({
  messages,
  transcript,
  voiceActive,
  sending,
  hasPerson,
  onSend,
}: ChatPaneProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, transcript, voiceActive]);

  const send = async (): Promise<void> => {
    const text = input.trim();
    if (!text || sending || voiceActive) return;
    setInput('');
    await onSend(text);
  };

  const emptyText = !hasPerson
    ? 'Choose who is using the companion in Settings.'
    : voiceActive
      ? 'Listening…'
      : 'Say hello.';

  return (
    <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
      <div
        className="chat-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-5"
        aria-live="polite"
      >
        {voiceActive
          ? transcript.map((line) => (
              <div
                key={line.id}
                className={`chat-bubble ${line.speaker === 'you' ? 'chat-bubble-user' : 'chat-bubble-companion'} ${
                  line.final ? '' : 'opacity-70'
                }`}
              >
                <span className="sr-only">{line.speaker === 'you' ? 'You: ' : 'Companion: '}</span>
                <p className="whitespace-pre-wrap">{line.text}</p>
              </div>
            ))
          : messages.map((message) => (
              <div
                key={message.id}
                className={`chat-bubble ${
                  message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-companion'
                }`}
              >
                <span className="sr-only">
                  {message.role === 'user' ? 'You: ' : 'Companion: '}
                </span>
                <p className="whitespace-pre-wrap">
                  {message.text}
                  {message.pending ? <span className="ml-1 animate-pulse">…</span> : null}
                </p>
              </div>
            ))}

        {!voiceActive && messages.length === 0 ? (
          <p className="mx-auto my-auto text-center text-xl text-slate-500">{emptyText}</p>
        ) : null}

        {voiceActive && transcript.length === 0 ? (
          <p className="mx-auto my-auto text-center text-xl text-slate-500">{emptyText}</p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {!voiceActive ? (
        <form
          className="flex items-end gap-2 border-t border-slate-200/80 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Message…"
            aria-label="Message"
            disabled={sending || !hasPerson}
            className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg leading-snug text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={sending || !hasPerson || !input.trim()}
            aria-label="Send message"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-teal-800 text-white shadow-md transition hover:bg-teal-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="h-6 w-6" />
          </button>
        </form>
      ) : null}
    </section>
  );
}
