'use client';

import { useState, type FormEvent } from 'react';
import type { NewPerson, Person } from '@companion/core/types';

interface PersonFormProps {
  initial?: Person;
  submitLabel: string;
  saving?: boolean;
  onSubmit: (input: NewPerson) => Promise<void> | void;
  onCancel?: () => void;
}

function listValue(values: string[]): string {
  return values.join(', ');
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PersonForm({ initial, submitLabel, saving, onSubmit, onCancel }: PersonFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [preferredName, setPreferredName] = useState(initial?.preferredName ?? '');
  const [interests, setInterests] = useState(listValue(initial?.interests ?? []));
  const [avoidTopics, setAvoidTopics] = useState(listValue(initial?.avoidTopics ?? []));
  const [careNotes, setCareNotes] = useState(initial?.careNotes ?? '');

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      preferredName: preferredName.trim(),
      interests: splitList(interests),
      avoidTopics: splitList(avoidTopics),
      careNotes: careNotes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-base font-medium text-slate-800">
          Full name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-base font-medium text-slate-800">
          Preferred name
          <input
            value={preferredName}
            onChange={(event) => setPreferredName(event.target.value)}
            required
            className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-base font-medium text-slate-800">
        Interests
        <span className="text-sm font-normal text-slate-500">Separate with commas</span>
        <input
          value={interests}
          onChange={(event) => setInterests(event.target.value)}
          placeholder="gardening, old movies, crosswords"
          className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-base font-medium text-slate-800">
        Topics to avoid
        <span className="text-sm font-normal text-slate-500">Separate with commas</span>
        <input
          value={avoidTopics}
          onChange={(event) => setAvoidTopics(event.target.value)}
          placeholder="politics"
          className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-base font-medium text-slate-800">
        Care notes
        <textarea
          value={careNotes}
          onChange={(event) => setCareNotes(event.target.value)}
          rows={4}
          placeholder="Lives alone. Daughter visits on Sundays."
          className="resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
        />
      </label>

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[52px] rounded-full bg-teal-800 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[52px] rounded-full px-6 text-base font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
