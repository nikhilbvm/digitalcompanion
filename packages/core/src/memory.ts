import type { DbPool } from './db.js';
import {
  mapMemoryNote,
  type MemoryNote,
  type MemoryNoteInput,
  type MemoryNoteRow,
} from './types.js';

/**
 * Memory helpers are wired into prompts in Part 2. The table and these
 * functions exist now so the schema and service boundaries stay stable.
 */

export async function addMemoryNote(
  pool: DbPool,
  input: MemoryNoteInput,
): Promise<MemoryNote> {
  const { rows } = await pool.query<MemoryNoteRow>(
    `insert into memory_notes
       (person_id, text, type, source, sensitivity, expires_at, active)
     values ($1, $2, $3, $4, $5, $6, true)
     returning *`,
    [
      input.personId,
      input.text,
      input.type ?? null,
      input.source ?? null,
      input.sensitivity,
      input.expiresAt ?? null,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('addMemoryNote: insert returned no row');
  return mapMemoryNote(row);
}

export async function listActiveMemoryNotes(
  pool: DbPool,
  personId: string,
  limit = 20,
): Promise<MemoryNote[]> {
  const { rows } = await pool.query<MemoryNoteRow>(
    `select * from memory_notes
      where person_id = $1
        and active = true
        and (expires_at is null or expires_at > now())
      order by created_at desc
      limit $2`,
    [personId, limit],
  );
  return rows.map(mapMemoryNote);
}

export async function deactivateMemoryNote(
  pool: DbPool,
  memoryNoteId: string,
): Promise<void> {
  await pool.query('update memory_notes set active = false where id = $1', [memoryNoteId]);
}

/**
 * Part 2 prompt block. Only low-sensitivity, active notes should be passed in
 * by the caller; this function assumes the caller has already filtered.
 */
export function buildMemoryBlock(notes: MemoryNote[]): string {
  if (notes.length === 0) return '';
  const lines = notes.map((note) => `- ${note.text.replace(/\s+/g, ' ').trim()}`);
  return `Things you remember from earlier conversations (use naturally, never list them back):\n${lines.join('\n')}`;
}
