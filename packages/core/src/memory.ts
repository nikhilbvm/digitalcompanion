import type { SupabaseClient } from '@supabase/supabase-js';
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
  client: SupabaseClient,
  input: MemoryNoteInput,
): Promise<MemoryNote> {
  const { data, error } = await client
    .from('memory_notes')
    .insert({
      person_id: input.personId,
      text: input.text,
      type: input.type ?? null,
      source: input.source ?? null,
      sensitivity: input.sensitivity,
      expires_at: input.expiresAt ?? null,
      active: true,
    })
    .select('*')
    .single();

  if (error) throw new Error(`addMemoryNote: ${error.message}`);
  return mapMemoryNote(data as MemoryNoteRow);
}

export async function listActiveMemoryNotes(
  client: SupabaseClient,
  personId: string,
  limit = 20,
): Promise<MemoryNote[]> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('memory_notes')
    .select('*')
    .eq('person_id', personId)
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listActiveMemoryNotes: ${error.message}`);
  return (data as MemoryNoteRow[]).map(mapMemoryNote);
}

export async function deactivateMemoryNote(
  client: SupabaseClient,
  memoryNoteId: string,
): Promise<void> {
  const { error } = await client
    .from('memory_notes')
    .update({ active: false })
    .eq('id', memoryNoteId);

  if (error) throw new Error(`deactivateMemoryNote: ${error.message}`);
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
