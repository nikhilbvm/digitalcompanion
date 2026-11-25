'use client';

import { useRef, useState } from 'react';
import { BigButton } from './BigButton';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface ChatPanelProps {
  messages: ChatMessageView[];
  sending: boolean;
  disabled?: boolean;
  onSend: (text: string) => Promise<void> | void;
  onEnd: () => Promise<void> | void;
}

export function ChatPanel({ messages, sending, disabled, onSend, onEnd }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechAvailable = getSpeechRecognition() !== null;

  const send = async (): Promise<void> => {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setInput('');
    await onSend(text);
  };

  const toggleDictation = (): void => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) transcript += `${result[0].transcript} `;
      }
      if (transcript.trim()) {
        setInput((current) => `${current}${current.trim() ? ' ' : ''}${transcript.trim()}`);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const readAloud = (text: string): void => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  return (
    <section className="flex w-full flex-col gap-4">
      <div
        className="flex max-h-[52vh] min-h-[220px] flex-col gap-4 overflow-y-auto rounded-2xl border-2 border-slate-300 bg-white/80 p-5"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="text-2xl text-slate-600">
            Type a message below, or use the microphone button to speak.
          </p>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[90%] rounded-2xl px-5 py-4 text-2xl leading-relaxed ${
              message.role === 'user'
                ? 'self-end bg-teal-100 text-slate-900'
                : 'self-start border border-slate-300 bg-amber-50 text-slate-900'
            }`}
          >
            <p className="whitespace-pre-wrap">
              {message.text}
              {message.pending ? <span className="ml-1 animate-pulse">…</span> : null}
            </p>
            {message.role === 'assistant' && !message.pending && message.text ? (
              <button
                type="button"
                onClick={() => readAloud(message.text)}
                className="mt-3 rounded-lg border border-slate-400 px-3 py-2 text-xl text-slate-800 hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
              >
                Read aloud
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-2 text-2xl font-medium text-slate-800">
        Your message
        <textarea
          className="min-h-[140px] w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-2xl leading-relaxed text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Hello, how are you today?"
          disabled={disabled}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <BigButton onClick={() => void send()} disabled={sending || disabled || !input.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </BigButton>

        {speechAvailable ? (
          <BigButton variant="quiet" onClick={toggleDictation} disabled={sending || disabled}>
            {listening ? 'Stop dictation' : 'Speak instead'}
          </BigButton>
        ) : null}

        <BigButton variant="end" onClick={() => void onEnd()} disabled={sending}>
          End
        </BigButton>
      </div>
    </section>
  );
}
