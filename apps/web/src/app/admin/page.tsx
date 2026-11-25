'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Conversation, Person } from '@companion/core/types';
import {
  createPerson,
  getConversationDetail,
  getConversations,
  getPeople,
  type ConversationDetail,
} from '@/lib/api';

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function AdminPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [interests, setInterests] = useState('');
  const [avoidTopics, setAvoidTopics] = useState('');
  const [careNotes, setCareNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshPeople = useCallback(async (): Promise<void> => {
    const list = await getPeople();
    setPeople(list);
    setSelectedPersonId((current) => current || list[0]?.id || '');
  }, []);

  useEffect(() => {
    refreshPeople().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not load people.'),
    );
  }, [refreshPeople]);

  useEffect(() => {
    if (!selectedPersonId) {
      setConversations([]);
      return;
    }
    setDetail(null);
    getConversations(selectedPersonId)
      .then(setConversations)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load conversations.'),
      );
  }, [selectedPersonId]);

  const handleCreatePerson = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const person = await createPerson({
        name: name.trim(),
        preferredName: preferredName.trim(),
        interests: splitList(interests),
        avoidTopics: splitList(avoidTopics),
        careNotes: careNotes.trim() || undefined,
      });
      await refreshPeople();
      setSelectedPersonId(person.id);
      setName('');
      setPreferredName('');
      setInterests('');
      setAvoidTopics('');
      setCareNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the person.');
    } finally {
      setSaving(false);
    }
  };

  const openConversation = async (conversationId: string): Promise<void> => {
    setError(null);
    try {
      setDetail(await getConversationDetail(conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the conversation.');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Companion admin</h1>
          <p className="text-lg text-slate-700">
            Local proof of concept — there is no login. Do not expose this page publicly.
          </p>
        </div>
        <a href="/" className="text-lg text-teal-800 underline underline-offset-4">
          Back to companion
        </a>
      </header>

      {error ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-lg text-red-900" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-6">
          <form
            onSubmit={(event) => void handleCreatePerson(event)}
            className="flex flex-col gap-3 rounded-2xl border border-slate-300 bg-white p-5"
          >
            <h2 className="text-2xl font-semibold text-slate-900">Create a test person</h2>

            <label className="flex flex-col gap-1 text-lg text-slate-800">
              Full name
              <input
                className="rounded-lg border border-slate-400 px-3 py-2 text-lg"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-lg text-slate-800">
              Preferred name
              <input
                className="rounded-lg border border-slate-400 px-3 py-2 text-lg"
                value={preferredName}
                onChange={(event) => setPreferredName(event.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-lg text-slate-800">
              Interests (comma separated)
              <input
                className="rounded-lg border border-slate-400 px-3 py-2 text-lg"
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                placeholder="gardening, old movies, crosswords"
              />
            </label>

            <label className="flex flex-col gap-1 text-lg text-slate-800">
              Topics to avoid (comma separated)
              <input
                className="rounded-lg border border-slate-400 px-3 py-2 text-lg"
                value={avoidTopics}
                onChange={(event) => setAvoidTopics(event.target.value)}
                placeholder="politics"
              />
            </label>

            <label className="flex flex-col gap-1 text-lg text-slate-800">
              Care notes
              <textarea
                className="min-h-[90px] rounded-lg border border-slate-400 px-3 py-2 text-lg"
                value={careNotes}
                onChange={(event) => setCareNotes(event.target.value)}
                placeholder="Lives alone. Daughter visits on Sundays."
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-teal-800 px-4 py-3 text-xl font-semibold text-white hover:bg-teal-900 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create person'}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-300 bg-white p-5">
            <h2 className="mb-3 text-2xl font-semibold text-slate-900">People</h2>
            <ul className="flex flex-col gap-2">
              {people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPersonId(person.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-lg ${
                      person.id === selectedPersonId
                        ? 'border-teal-700 bg-teal-50 text-teal-950'
                        : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-semibold">{person.preferredName}</span>{' '}
                    <span className="text-slate-600">({person.name})</span>
                  </button>
                </li>
              ))}
              {people.length === 0 ? (
                <li className="text-lg text-slate-600">No people yet.</li>
              ) : null}
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-300 bg-white p-5">
            <h2 className="mb-3 text-2xl font-semibold text-slate-900">Conversations</h2>
            <ul className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-lg ${
                      detail?.conversation.id === conversation.id
                        ? 'border-amber-700 bg-amber-50'
                        : 'border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-semibold">{conversation.mode}</span>{' '}
                    <span className="text-slate-600">
                      {formatTime(conversation.startedAt)}
                      {conversation.endedAt ? ' · ended' : ' · active'}
                    </span>
                  </button>
                </li>
              ))}
              {conversations.length === 0 ? (
                <li className="text-lg text-slate-600">No conversations yet.</li>
              ) : null}
            </ul>
          </div>

          {detail ? (
            <div className="flex flex-col gap-5 rounded-2xl border border-slate-300 bg-white p-5">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {detail.person.preferredName} · {detail.conversation.mode}
                </h2>
                <p className="text-lg text-slate-600">
                  Started {formatTime(detail.conversation.startedAt)}
                  {detail.conversation.endedAt
                    ? ` · ended ${formatTime(detail.conversation.endedAt)}`
                    : ''}
                </p>
              </div>

              <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-3 text-lg ${
                      message.role === 'user'
                        ? 'border-teal-200 bg-teal-50'
                        : 'border-slate-300 bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {message.role} · {formatTime(message.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap text-slate-900">{message.text}</p>
                  </div>
                ))}
                {detail.messages.length === 0 ? (
                  <p className="text-lg text-slate-600">No messages.</p>
                ) : null}
              </div>

              <div>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">Guardrail flags</h3>
                <ul className="flex flex-col gap-2">
                  {detail.flags.map((flag) => (
                    <li
                      key={flag.id}
                      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-lg text-amber-950"
                    >
                      <span className="font-semibold">{flag.stage}</span> ·{' '}
                      <span className="font-semibold">{flag.category}</span>
                      {flag.detail ? ` — ${flag.detail}` : ''}
                      <span className="block text-sm text-amber-800">
                        {formatTime(flag.createdAt)}
                      </span>
                    </li>
                  ))}
                  {detail.flags.length === 0 ? (
                    <li className="text-lg text-slate-600">No flags.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
