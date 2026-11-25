import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseClient,
  mapConversation,
  mapGuardrailFlag,
  mapMessage,
  mapPerson,
  maskSensitive,
  type Conversation,
  type ConversationMode,
  type ConversationRow,
  type GuardrailFlag,
  type GuardrailFlagRow,
  type GuardrailHit,
  type GuardrailStage,
  type Message,
  type MessageRow,
  type NewPerson,
  type Person,
  type PersonRow,
} from '@companion/core';
import { ConfigError, NotFoundError } from '../errors.js';

function fail(operation: string, message: string): never {
  throw new Error(`${operation}: ${message}`);
}

export class Store {
  constructor(private readonly client: SupabaseClient) {}

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  async listPeople(): Promise<Person[]> {
    const { data, error } = await this.client
      .from('people')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) fail('listPeople', error.message);
    return (data as PersonRow[]).map(mapPerson);
  }

  async getPerson(personId: string): Promise<Person | null> {
    const { data, error } = await this.client
      .from('people')
      .select('*')
      .eq('id', personId)
      .maybeSingle();
    if (error) fail('getPerson', error.message);
    return data ? mapPerson(data as PersonRow) : null;
  }

  async createPerson(input: NewPerson): Promise<Person> {
    const { data, error } = await this.client
      .from('people')
      .insert({
        name: input.name,
        preferred_name: input.preferredName,
        interests: input.interests,
        avoid_topics: input.avoidTopics,
        care_notes: input.careNotes ?? null,
      })
      .select('*')
      .single();
    if (error) fail('createPerson', error.message);
    return mapPerson(data as PersonRow);
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  async createConversation(personId: string, mode: ConversationMode): Promise<Conversation> {
    const { data, error } = await this.client
      .from('conversations')
      .insert({ person_id: personId, mode })
      .select('*')
      .single();
    if (error) fail('createConversation', error.message);
    return mapConversation(data as ConversationRow);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) fail('getConversation', error.message);
    return data ? mapConversation(data as ConversationRow) : null;
  }

  async listConversations(personId?: string): Promise<Conversation[]> {
    let query = this.client
      .from('conversations')
      .select('*')
      .order('started_at', { ascending: false });
    if (personId) query = query.eq('person_id', personId);

    const { data, error } = await query;
    if (error) fail('listConversations', error.message);
    return (data as ConversationRow[]).map(mapConversation);
  }

  async endConversation(conversationId: string): Promise<Conversation> {
    const existing = await this.getConversation(conversationId);
    if (!existing) throw new NotFoundError('Conversation not found');
    if (existing.endedAt) return existing;

    const { data, error } = await this.client
      .from('conversations')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', conversationId)
      .select('*')
      .single();
    if (error) fail('endConversation', error.message);
    return mapConversation(data as ConversationRow);
  }

  // -------------------------------------------------------------------------
  // Messages / flags
  // -------------------------------------------------------------------------

  async addMessage(input: {
    conversationId: string;
    role: 'user' | 'assistant';
    text: string;
  }): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        role: input.role,
        text: maskSensitive(input.text),
      })
      .select('*')
      .single();
    if (error) fail('addMessage', error.message);
    return mapMessage(data as MessageRow);
  }

  async getRecentMessages(conversationId: string, limit: number): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) fail('getRecentMessages', error.message);
    return (data as MessageRow[]).map(mapMessage).reverse();
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) fail('listMessages', error.message);
    return (data as MessageRow[]).map(mapMessage);
  }

  async addFlags(
    conversationId: string,
    messageId: string | null,
    stage: GuardrailStage,
    hits: GuardrailHit[],
  ): Promise<void> {
    if (hits.length === 0) return;

    const rows = hits.map((hit) => ({
      conversation_id: conversationId,
      message_id: messageId,
      stage,
      category: hit.category,
      detail: hit.detail ? maskSensitive(hit.detail) : null,
    }));

    const { error } = await this.client.from('guardrail_flags').insert(rows);
    if (error) fail('addFlags', error.message);
  }

  async listFlags(conversationId: string): Promise<GuardrailFlag[]> {
    const { data, error } = await this.client
      .from('guardrail_flags')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) fail('listFlags', error.message);
    return (data as GuardrailFlagRow[]).map(mapGuardrailFlag);
  }
}

let cached: Store | null = null;

/** Lazy so the API can start (and serve /health) before Supabase is configured. */
export function getStore(): Store {
  if (!cached) {
    try {
      cached = new Store(createSupabaseClient());
    } catch (error) {
      throw new ConfigError(
        error instanceof Error ? error.message : 'Supabase is not configured',
      );
    }
  }
  return cached;
}
