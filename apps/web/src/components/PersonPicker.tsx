import type { Person } from '@companion/core/types';

interface PersonPickerProps {
  people: Person[];
  value: string;
  onChange: (personId: string) => void;
  disabled?: boolean;
}

export function PersonPicker({ people, value, onChange, disabled }: PersonPickerProps) {
  return (
    <label className="flex w-full flex-col gap-2 text-2xl font-medium text-slate-800">
      Who is using the companion?
      <select
        className="min-h-[64px] w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-2xl text-slate-900 shadow-sm focus:border-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Choose a person</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.preferredName} ({person.name})
          </option>
        ))}
      </select>
      {people.length === 0 ? (
        <span className="text-xl text-slate-600">
          No people yet. Create one in the <a className="underline" href="/admin">admin page</a>.
        </span>
      ) : null}
    </label>
  );
}
