'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Person } from '@companion/core/types';
import { CallDock } from '@/components/CallDock';
import { ChatPane, type ChatMessageView } from '@/components/ChatPane';
import { CompanionOrb } from '@/components/CompanionOrb';
import { Drawer } from '@/components/Drawer';
import {
  AdminIcon,
  ChevronLeftIcon,
  MenuIcon,
  SettingsIcon,
} from '@/components/Icons';
import { SplashScreen } from '@/components/SplashScreen';
import { Toast, type ToastState } from '@/components/Toast';
import { endConversation, getPeople, streamChat } from '@/lib/api';
import {
  VoiceSession,
  type TranscriptLine,
  type VoiceSpeaker,
  type VoiceStatus,
} from '@/lib/livekit';
import { readPreferences, savePreferences } from '@/lib/preferences';

type MenuView = 'menu' | 'settings';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusLabel(status: VoiceStatus, speaker: VoiceSpeaker, hasPerson: boolean): string {
  if (!hasPerson) return 'Choose someone in Settings';
  if (status === 'requesting-mic') return 'Requesting microphone…';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'speaking') return 'Companion speaking…';
  if (status === 'listening') return speaker === 'user' ? 'Listening…' : 'Listening…';
  return 'Ready when you are';
}

export default function CompanionPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('menu');
  const [draftPersonId, setDraftPersonId] = useState('');
  const [draftShowChat, setDraftShowChat] = useState(false);

  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [speaker, setSpeaker] = useState<VoiceSpeaker>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [ready, setReady] = useState(false);

  const voiceRef = useRef<VoiceSession | null>(null);

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'success'): void => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismissToast = useCallback((): void => setToast(null), []);

  useEffect(() => {
    let cancelled = false;
    getPeople()
      .then((list) => {
        if (cancelled) return;
        setPeople(list);
        const preferences = readPreferences();
        const saved = list.some((person) => person.id === preferences.personId)
          ? preferences.personId
          : null;
        const initialPersonId = saved ?? list[0]?.id ?? '';
        setPersonId(initialPersonId);
        setDraftPersonId(initialPersonId);
        setShowChat(preferences.showChat);
        setDraftShowChat(preferences.showChat);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReady(true);
        showToast(error instanceof Error ? error.message : 'Could not load people.', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    return () => {
      void voiceRef.current?.end();
    };
  }, []);

  const closeMenu = useCallback((): void => setMenuOpen(false), []);

  const openMenu = (): void => {
    setMenuView('menu');
    setMenuOpen(true);
  };

  const openSettings = (): void => {
    setDraftPersonId(personId || people[0]?.id || '');
    setDraftShowChat(showChat);
    setMenuView('settings');
  };

  const saveSettings = (): void => {
    if (voiceStatus === 'listening' || voiceStatus === 'speaking' || voiceStatus === 'connecting') {
      showToast('End the call before changing settings.', 'error');
      return;
    }
    if (!draftPersonId) {
      showToast('Choose who is using the companion.', 'error');
      return;
    }

    setPersonId(draftPersonId);
    setShowChat(draftShowChat);
    savePreferences(draftPersonId, draftShowChat);
    setMessages([]);
    setTranscript([]);
    setConversationId(null);
    setVoiceStatus('idle');
    setSpeaker(null);
    setMenuOpen(false);
    showToast('Settings saved.');
  };

  const resetConversation = (): void => {
    setConversationId(null);
    setTranscript([]);
    setMessages([]);
    setSpeaker(null);
    setAudioBlocked(false);
    setVoiceStatus('idle');
  };

  const startVoice = async (): Promise<void> => {
    if (!personId) {
      showToast('Choose who is using the companion in Settings.', 'error');
      return;
    }

    if (conversationId) {
      try {
        await endConversation(conversationId);
      } catch {
        // Starting the call matters more than closing a text row.
      }
    }

    resetConversation();
    setVoiceStatus('requesting-mic');

    const session = new VoiceSession();
    voiceRef.current = session;

    await session.start(personId, {
      onStatus: (status) => {
        setVoiceStatus(status);
        if (status === 'ended') {
          setSpeaker(null);
          setTranscript([]);
          setConversationId(null);
        }
      },
      onSpeaker: setSpeaker,
      onTranscript: setTranscript,
      onConversationId: setConversationId,
      onAudioBlocked: setAudioBlocked,
      onError: (message) => {
        setSpeaker(null);
        showToast(message, 'error');
      },
    });
  };

  const endVoice = async (): Promise<void> => {
    await voiceRef.current?.end();
    voiceRef.current = null;
    resetConversation();
  };

  const sendChat = async (text: string): Promise<void> => {
    if (!personId || sending) return;

    const userMessage: ChatMessageView = { id: newId(), role: 'user', text };
    const assistantId = newId();
    const assistantMessage: ChatMessageView = {
      id: assistantId,
      role: 'assistant',
      text: '',
      pending: true,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setSending(true);

    try {
      await streamChat(
        { personId, conversationId: conversationId ?? undefined, message: text },
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
          onDone: (result) => {
            setConversationId(result.conversationId);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, pending: false } : message,
              ),
            );
          },
          onError: (message) => showToast(message, 'error'),
        },
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'The companion had trouble replying.',
        'error',
      );
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, pending: false } : message,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const inVoice =
    voiceStatus === 'requesting-mic' ||
    voiceStatus === 'connecting' ||
    voiceStatus === 'listening' ||
    voiceStatus === 'speaking';
  const hasPerson = Boolean(personId);
  const selectedPerson = people.find((person) => person.id === personId);
  const statusText =
    voiceStatus === 'error' || voiceStatus === 'ended'
      ? statusLabel('idle', null, hasPerson)
      : statusLabel(voiceStatus, speaker, hasPerson);

  return (
    <>
      <SplashScreen />
      <Toast toast={toast} onDismiss={dismissToast} />

      <Drawer
        open={menuOpen}
        title={menuView === 'settings' ? 'Settings' : 'Menu'}
        onClose={closeMenu}
      >
        {menuView === 'menu' ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={openSettings}
              className="flex min-h-[64px] w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 text-left text-lg font-semibold text-slate-900 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              <SettingsIcon className="h-6 w-6 text-teal-800" />
              Settings
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => setMenuView('menu')}
              className="flex w-fit items-center gap-1 text-base font-semibold text-slate-600 hover:text-slate-900"
            >
              <ChevronLeftIcon className="h-5 w-5" />
              Menu
            </button>

            <label className="flex flex-col gap-2 text-base font-semibold text-slate-800">
              Who is using the companion?
              <select
                value={draftPersonId}
                onChange={(event) => setDraftPersonId(event.target.value)}
                disabled={people.length === 0}
                className="min-h-[56px] rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
              >
                {people.length === 0 ? <option value="">No people yet</option> : null}
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.preferredName} ({person.name})
                  </option>
                ))}
              </select>
            </label>

            {people.length === 0 ? (
              <p className="text-base text-slate-600">
                Add someone in the{' '}
                <Link href="/admin" className="font-semibold text-teal-800 underline">
                  admin page
                </Link>
                .
              </p>
            ) : null}

            <label className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-lg text-slate-900">
              <input
                type="checkbox"
                checked={draftShowChat}
                onChange={(event) => setDraftShowChat(event.target.checked)}
                className="h-5 w-5 accent-teal-800"
              />
              Show chat
            </label>

            <button
              type="button"
              onClick={saveSettings}
              disabled={people.length === 0}
              className="min-h-[56px] rounded-full bg-teal-800 px-6 text-lg font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </Drawer>

      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#fdf6e3] text-slate-900">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[0.68rem] font-semibold tracking-[0.08em] text-teal-900 uppercase">
              Digital Companion
            </p>
            {selectedPerson ? (
              <p className="truncate text-lg font-medium text-slate-700">
                {selectedPerson.preferredName}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/admin"
              className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              <AdminIcon className="h-5 w-5" />
              Admin
            </Link>
            <button
              type="button"
              onClick={openMenu}
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/70 hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
              aria-label="Open menu"
            >
              <MenuIcon className="h-7 w-7" />
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {showChat ? (
            <>
              <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center gap-3 px-4 pb-1 sm:px-6">
                <CompanionOrb status={voiceStatus} speaker={speaker} compact />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-800" aria-live="polite">
                    {statusText}
                  </p>
                  {inVoice && audioBlocked ? (
                    <button
                      type="button"
                      onClick={() => void voiceRef.current?.enableAudio()}
                      className="text-sm font-semibold text-amber-800 underline"
                    >
                      Enable sound
                    </button>
                  ) : null}
                </div>
              </div>
              <ChatPane
                messages={messages}
                transcript={transcript}
                voiceActive={inVoice}
                sending={sending}
                hasPerson={hasPerson}
                onSend={sendChat}
              />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6 pb-10">
              <CompanionOrb status={voiceStatus} speaker={speaker} />
              <div className="text-center">
                <p className="text-xl font-medium text-slate-700" aria-live="polite">
                  {statusText}
                </p>
                {inVoice && audioBlocked ? (
                  <button
                    type="button"
                    onClick={() => void voiceRef.current?.enableAudio()}
                    className="mt-3 text-base font-semibold text-amber-800 underline"
                  >
                    Enable sound
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </main>

        <CallDock
          hasPerson={hasPerson && ready}
          status={voiceStatus}
          onCall={() => void startVoice()}
          onEnd={() => void endVoice()}
        />
      </div>
    </>
  );
}
