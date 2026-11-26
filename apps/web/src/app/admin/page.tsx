'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Conversation, NewPerson, Person } from '@companion/core/types';
import { Drawer } from '@/components/Drawer';
import {
  ChatIcon,
  CloseIcon,
  MenuIcon,
  PlusIcon,
  UsersIcon,
} from '@/components/Icons';
import { PersonForm } from '@/components/PersonForm';
import { Toast, type ToastState } from '@/components/Toast';
import {
  createPerson,
  getConversationDetail,
  getConversations,
  getPeople,
  updatePerson,
  type ConversationDetail,
} from '@/lib/api';

type Section = 'people' | 'conversations' | 'new';

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>('people');
  const [menuOpen, setMenuOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'success'): void => {
    setToast({ id: Date.now(), message, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const refreshPeople = useCallback(async (): Promise<Person[]> => {
    const list = await getPeople();
    setPeople(list);
    setSelectedPersonId((current) => current || list[0]?.id || '');
    return list;
  }, []);

  useEffect(() => {
    refreshPeople().catch((error: unknown) =>
      showToast(error instanceof Error ? error.message : 'Could not load people.', 'error'),
    );
  }, [refreshPeople, showToast]);

  useEffect(() => {
    if (!selectedPersonId) {
      setConversations([]);
      setDetail(null);
      return;
    }
    setDetail(null);
    getConversations(selectedPersonId)
      .then(setConversations)
      .catch((error: unknown) =>
        showToast(
          error instanceof Error ? error.message : 'Could not load conversations.',
          'error',
        ),
      );
  }, [selectedPersonId, showToast]);

  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? null;

  const savePerson = async (input: NewPerson): Promise<void> => {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const updated = await updatePerson(selectedPerson.id, input);
      setPeople((current) =>
        current.map((person) => (person.id === updated.id ? updated : person)),
      );
      showToast('Person saved.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save the person.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addPerson = async (input: NewPerson): Promise<void> => {
    setSaving(true);
    try {
      const person = await createPerson(input);
      setPeople((current) => [person, ...current]);
      setSelectedPersonId(person.id);
      setSection('people');
      showToast('Person created.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create the person.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const chooseSection = (next: Section): void => {
    setSection(next);
    setMenuOpen(false);
  };

  const openConversation = async (conversationId: string): Promise<void> => {
    try {
      setDetail(await getConversationDetail(conversationId));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load the conversation.',
        'error',
      );
    }
  };

  return (
    <>
      <Toast toast={toast} onDismiss={dismissToast} />
      <Drawer open={menuOpen} title="Admin menu" onClose={closeMenu}>
        <nav className="flex flex-col gap-2" aria-label="Admin sections">
          <button
            type="button"
            onClick={() => chooseSection('people')}
            className={`admin-nav ${section === 'people' ? 'admin-nav-active' : ''}`}
          >
            <UsersIcon className="h-5 w-5" />
            People
          </button>
          <button
            type="button"
            onClick={() => chooseSection('conversations')}
            className={`admin-nav ${section === 'conversations' ? 'admin-nav-active' : ''}`}
          >
            <ChatIcon className="h-5 w-5" />
            Conversations
          </button>
          <button
            type="button"
            onClick={() => chooseSection('new')}
            className={`admin-nav ${section === 'new' ? 'admin-nav-active' : ''}`}
          >
            <PlusIcon className="h-5 w-5" />
            New person
          </button>
        </nav>
      </Drawer>

      <div className="min-h-dvh bg-[#fdf6e3] text-slate-900">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-4 sm:px-6">
          <div>
            <p className="text-[0.68rem] font-semibold tracking-[0.08em] text-teal-900 uppercase">
              Admin
            </p>
            <p className="hidden text-base font-medium text-slate-700 sm:block">
              Manage the companion
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              className="flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              Companion
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/70 hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
              aria-label="Open admin menu"
            >
              <MenuIcon className="h-7 w-7" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6">
          {section === 'people' ? (
            <div className="flex flex-col gap-5">
              <div className="admin-card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h1 className="text-2xl font-semibold">People</h1>
                  <button
                    type="button"
                    onClick={() => setSection('new')}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-teal-800 px-4 text-sm font-semibold text-white"
                  >
                    <PlusIcon className="h-4 w-4" />
                    New
                  </button>
                </div>

                {people.length === 0 ? (
                  <p className="text-base text-slate-600">No people yet. Create the first person.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {people.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => setSelectedPersonId(person.id)}
                        className={`min-h-[48px] rounded-full border px-4 text-left text-base ${
                          person.id === selectedPersonId
                            ? 'border-teal-700 bg-teal-50 font-semibold text-teal-950'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        {person.preferredName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedPerson ? (
                <div className="admin-card">
                  <div className="mb-4">
                    <h2 className="text-2xl font-semibold">Edit {selectedPerson.preferredName}</h2>
                    <p className="text-sm text-slate-500">
                      Updates the profile used for text and voice conversations.
                    </p>
                  </div>
                  <PersonForm
                    key={selectedPerson.id}
                    initial={selectedPerson}
                    submitLabel="Save person"
                    saving={saving}
                    onSubmit={savePerson}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {section === 'new' ? (
            <div className="admin-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold">New person</h1>
                  <p className="text-sm text-slate-500">Create a companion profile.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('people')}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <PersonForm submitLabel="Create person" saving={saving} onSubmit={addPerson} />
            </div>
          ) : null}

          {section === 'conversations' ? (
            <div className="flex flex-col gap-5">
              <div className="admin-card">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold">Conversations</h1>
                    <p className="text-sm text-slate-500">Review recent conversations and flags.</p>
                  </div>
                  <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-700">
                    Person
                    <select
                      value={selectedPersonId}
                      onChange={(event) => setSelectedPersonId(event.target.value)}
                      className="min-h-[44px] max-w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                    >
                      {people.length === 0 ? <option value="">No people</option> : null}
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.preferredName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {conversations.length === 0 ? (
                  <p className="text-base text-slate-600">No conversations yet.</p>
                ) : (
                  <ul className="flex max-h-[280px] flex-col gap-2 overflow-y-auto">
                    {conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => void openConversation(conversation.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left text-base ${
                            detail?.conversation.id === conversation.id
                              ? 'border-amber-600 bg-amber-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-semibold capitalize">{conversation.mode}</span>{' '}
                          <span className="text-slate-500">
                            {formatTime(conversation.startedAt)}
                            {conversation.endedAt ? ' · ended' : ' · active'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail ? (
                <div className="admin-card">
                  <div className="mb-4">
                    <h2 className="text-2xl font-semibold">
                      {detail.person.preferredName} · {detail.conversation.mode}
                    </h2>
                    <p className="text-sm text-slate-500">
                      Started {formatTime(detail.conversation.startedAt)}
                      {detail.conversation.endedAt
                        ? ` · ended ${formatTime(detail.conversation.endedAt)}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
                    {detail.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-xl border p-3 text-base ${
                          message.role === 'user'
                            ? 'ml-auto max-w-[88%] border-teal-200 bg-teal-50'
                            : 'mr-auto max-w-[88%] border-slate-200 bg-white'
                        }`}
                      >
                        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                          {message.role} · {formatTime(message.createdAt)}
                        </p>
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      </div>
                    ))}
                    {detail.messages.length === 0 ? (
                      <p className="text-base text-slate-600">No messages.</p>
                    ) : null}
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <h3 className="mb-2 text-lg font-semibold">Guardrail flags</h3>
                    <ul className="flex flex-col gap-2">
                      {detail.flags.map((flag) => (
                        <li
                          key={flag.id}
                          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-base text-amber-950"
                        >
                          <span className="font-semibold">{flag.stage}</span> ·{' '}
                          <span className="font-semibold">{flag.category}</span>
                          {flag.detail ? ` — ${flag.detail}` : ''}
                          <span className="block text-xs text-amber-800">
                            {formatTime(flag.createdAt)}
                          </span>
                        </li>
                      ))}
                      {detail.flags.length === 0 ? (
                        <li className="text-base text-slate-600">No flags.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
    </>
  );
}
