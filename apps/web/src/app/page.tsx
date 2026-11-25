'use client';

import { useEffect, useRef, useState } from 'react';
import type { Person } from '@companion/core/types';
import { BigButton } from '@/components/BigButton';
import { ChatPanel, type ChatMessageView } from '@/components/ChatPanel';
import { PersonPicker } from '@/components/PersonPicker';
import { VoicePanel } from '@/components/VoicePanel';
import {
  endConversation,
  getPeople,
  streamChat,
  type ChatFlag,
} from '@/lib/api';
import { VoiceSession, type TranscriptLine, type VoiceStatus } from '@/lib/livekit';

type Mode = 'home' | 'voice' | 'chat';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CompanionPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState('');
  const [mode, setMode] = useState<Mode>('home');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFlag, setLastFlag] = useState<ChatFlag | null>(null);

  const voiceRef = useRef<VoiceSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPeople()
      .then((list) => {
        if (cancelled) return;
        setPeople(list);
        setPersonId((current) => current || list[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load people.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      void voiceRef.current?.end();
    };
  }, []);

  const resetConversation = (): void => {
    setConversationId(null);
    setTranscript([]);
    setMessages([]);
    setLastFlag(null);
    setVoiceStatus('idle');
  };

  const handlePersonChange = (nextPersonId: string): void => {
    setPersonId(nextPersonId);
    resetConversation();
  };

  const startVoice = async (): Promise<void> => {
    if (!personId) {
      setError('Please choose a person first.');
      return;
    }
    setError(null);
    setLastFlag(null);
    setTranscript([]);
    setMode('voice');

    const session = new VoiceSession();
    voiceRef.current = session;

    await session.start(
      personId,
      {
        onStatus: setVoiceStatus,
        onTranscript: setTranscript,
        onConversationId: setConversationId,
        onError: setError,
      },
      conversationId ?? undefined,
    );
  };

  const endVoice = async (): Promise<void> => {
    await voiceRef.current?.end();
    voiceRef.current = null;
    setVoiceStatus('ended');
    setMode('home');
    resetConversation();
  };

  const startChat = (): void => {
    if (!personId) {
      setError('Please choose a person first.');
      return;
    }
    setError(null);
    setLastFlag(null);
    setMessages([]);
    setConversationId(null);
    setMode('chat');
  };

  const sendChat = async (text: string): Promise<void> => {
    if (!personId || sending) return;

    const userMessage: ChatMessageView = {
      id: newId(),
      role: 'user',
      text,
    };
    const assistantId = newId();
    const assistantMessage: ChatMessageView = {
      id: assistantId,
      role: 'assistant',
      text: '',
      pending: true,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setSending(true);
    setError(null);

    try {
      await streamChat(
        {
          personId,
          conversationId: conversationId ?? undefined,
          message: text,
        },
        {
          onMeta: (meta) => setConversationId(meta.conversationId),
          onDelta: (delta) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, text: message.text + delta, pending: true }
                  : message,
              ),
            );
          },
          onFlag: (flag) => setLastFlag(flag),
          onDone: (result) => {
            setConversationId(result.conversationId);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, pending: false } : message,
              ),
            );
          },
          onError: (message) => setError(message),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The companion had trouble replying.');
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, pending: false } : message,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const endChat = async (): Promise<void> => {
    if (conversationId) {
      try {
        await endConversation(conversationId);
      } catch {
        // local reset still matters
      }
    }
    resetConversation();
    setMode('home');
  };

  const busy = mode !== 'home';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-teal-950 sm:text-5xl">
            Your Companion
          </h1>
          <a
            href="/admin"
            className="rounded-lg px-3 py-2 text-lg text-slate-700 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          >
            Admin
          </a>
        </div>
        <p className="text-2xl text-slate-700">
          A friendly voice to talk with, any time you like.
        </p>
      </header>

      <PersonPicker
        people={people}
        value={personId}
        onChange={handlePersonChange}
        disabled={busy || sending}
      />

      {error ? (
        <div
          className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-2xl text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {mode === 'home' ? (
        <section className="flex flex-col gap-6 py-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigButton
              onClick={() => void startVoice()}
              disabled={!personId}
              className="min-h-[140px] text-4xl"
            >
              Talk now
            </BigButton>
            <BigButton
              variant="chat"
              onClick={startChat}
              disabled={!personId}
              className="min-h-[140px] text-4xl"
            >
              Chat now
            </BigButton>
          </div>
          <p className="text-2xl text-slate-700">
            You can talk out loud or type. Take your time — there is no rush.
          </p>
        </section>
      ) : null}

      {mode === 'voice' ? (
        <VoicePanel status={voiceStatus} transcript={transcript} onEnd={endVoice} />
      ) : null}

      {mode === 'chat' ? (
        <ChatPanel
          messages={messages}
          sending={sending}
          onSend={sendChat}
          onEnd={endChat}
        />
      ) : null}

      {lastFlag ? (
        <p className="text-lg text-slate-600" aria-live="polite">
          Safety note recorded for review: {lastFlag.category}.
        </p>
      ) : null}

      <footer className="mt-auto flex flex-col gap-2 border-t border-slate-300 pt-5 text-lg text-slate-600">
        <p>
          This is a local proof of concept. It is not an emergency service. In an
          emergency call 911. For suicidal thoughts call or text 988.
        </p>
        <p>Conversations are saved for review by a family administrator.</p>
      </footer>
    </main>
  );
}
