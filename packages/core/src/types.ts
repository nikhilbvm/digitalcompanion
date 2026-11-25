import { z } from 'zod';

export const conversationModeSchema = z.enum(['voice', 'text']);
export type ConversationMode = z.infer<typeof conversationModeSchema>;

export const guardrailCategorySchema = z.enum([
  'none',
  'emergency',
  'self_harm',
  'scam',
  'abuse',
  'medical_question',
  'distress',
]);
export type GuardrailCategory = z.infer<typeof guardrailCategorySchema>;

export const guardrailStageSchema = z.enum(['input', 'output']);
export type GuardrailStage = z.infer<typeof guardrailStageSchema>;

export const newPersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().min(1).max(80),
  interests: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  avoidTopics: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  careNotes: z.string().trim().max(4000).optional(),
});
export type NewPerson = z.infer<typeof newPersonSchema>;

export const chatRequestSchema = z.object({
  personId: z.uuid(),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const livekitTokenRequestSchema = z.object({
  personId: z.uuid(),
  conversationId: z.uuid().optional(),
});
export type LivekitTokenRequest = z.infer<typeof livekitTokenRequestSchema>;

export const memoryNoteInputSchema = z.object({
  personId: z.uuid(),
  text: z.string().trim().min(1).max(2000),
  type: z.string().trim().max(60).optional(),
  source: z.string().trim().max(120).optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).default('low'),
  expiresAt: z.string().datetime().optional(),
});
export type MemoryNoteInput = z.infer<typeof memoryNoteInputSchema>;

// ---------------------------------------------------------------------------
// Application types (camelCase; mapped from snake_case rows at the boundary)
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  preferredName: string;
  interests: string[];
  avoidTopics: string[];
  careNotes: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  personId: string;
  mode: ConversationMode;
  startedAt: string;
  endedAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

/** Provider-neutral turn used by the text chat LLM adapters. */
export interface ChatTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuardrailFlag {
  id: string;
  conversationId: string;
  messageId: string | null;
  stage: GuardrailStage;
  category: GuardrailCategory;
  detail: string | null;
  createdAt: string;
}

export interface MemoryNote {
  id: string;
  personId: string;
  text: string;
  type: string | null;
  source: string | null;
  sensitivity: 'low' | 'medium' | 'high' | null;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export interface PersonRow {
  id: string;
  name: string;
  preferred_name: string;
  interests: string[] | null;
  avoid_topics: string[] | null;
  care_notes: string | null;
  created_at: string;
}

export function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    preferredName: row.preferred_name,
    interests: row.interests ?? [],
    avoidTopics: row.avoid_topics ?? [],
    careNotes: row.care_notes,
    createdAt: row.created_at,
  };
}

export interface ConversationRow {
  id: string;
  person_id: string;
  mode: ConversationMode;
  started_at: string;
  ended_at: string | null;
}

export function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    personId: row.person_id,
    mode: row.mode,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    text: row.text,
    createdAt: row.created_at,
  };
}

export interface GuardrailFlagRow {
  id: string;
  conversation_id: string;
  message_id: string | null;
  stage: GuardrailStage;
  category: GuardrailCategory;
  detail: string | null;
  created_at: string;
}

export function mapGuardrailFlag(row: GuardrailFlagRow): GuardrailFlag {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    stage: row.stage,
    category: row.category,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export interface MemoryNoteRow {
  id: string;
  person_id: string;
  text: string;
  type: string | null;
  source: string | null;
  sensitivity: 'low' | 'medium' | 'high' | null;
  created_at: string;
  expires_at: string | null;
  active: boolean;
}

export function mapMemoryNote(row: MemoryNoteRow): MemoryNote {
  return {
    id: row.id,
    personId: row.person_id,
    text: row.text,
    type: row.type,
    source: row.source,
    sensitivity: row.sensitivity,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    active: row.active,
  };
}

// ---------------------------------------------------------------------------
// Guardrail result shapes shared by API + agent
// ---------------------------------------------------------------------------

export interface GuardrailHit {
  category: Exclude<GuardrailCategory, 'none'>;
  detail: string;
  source: 'pattern' | 'classifier' | 'output';
  confidence?: number;
}

export interface InputGuardrailResult {
  category: GuardrailCategory;
  confidence: number;
  hits: GuardrailHit[];
  /** Original text with sensitive identifiers replaced by redaction tokens. */
  maskedText: string;
  /** One-line instruction to append to the system prompt for this turn. */
  safetyInstruction: string | null;
}

export interface OutputGuardrailResult {
  /** Text that is safe to speak/show. */
  text: string;
  flags: GuardrailHit[];
}
