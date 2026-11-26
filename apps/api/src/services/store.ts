import {
  createDbPool,
  mapConversation,
  mapGuardrailFlag,
  mapMessage,
  mapPerson,
  maskSensitive,
  type Conversation,
  type ConversationMode,
  type ConversationRow,
  type DbPool,
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
  constructor(private readonly db: DbPool) {}

  async close(): Promise<void> {
    await this.db.end();
  }

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  async listPeople(): Promise<Person[]> {
    const { rows } = await this.db.query<PersonRow>(
      'select * from people order by created_at desc',
    );
    return rows.map(mapPerson);
  }

  async getPerson(personId: string): Promise<Person | null> {
    const { rows } = await this.db.query<PersonRow>(
      'select * from people where id = $1',
      [personId],
    );
    const row = rows[0];
    return row ? mapPerson(row) : null;
  }

  async createPerson(input: NewPerson): Promise<Person> {
    const { rows } = await this.db.query<PersonRow>(
      `insert into people (name, preferred_name, interests, avoid_topics, care_notes)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        input.name,
        input.preferredName,
        input.interests,
        input.avoidTopics,
        input.careNotes ?? null,
      ],
    );
    const row = rows[0];
    if (!row) fail('createPerson', 'insert returned no row');
    return mapPerson(row);
  }

  async updatePerson(personId: string, input: NewPerson): Promise<Person> {
    const { rows } = await this.db.query<PersonRow>(
      `update people
          set name = $2,
              preferred_name = $3,
              interests = $4,
              avoid_topics = $5,
              care_notes = $6
        where id = $1
        returning *`,
      [
        personId,
        input.name,
        input.preferredName,
        input.interests,
        input.avoidTopics,
        input.careNotes ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new NotFoundError('Person not found');
    return mapPerson(row);
  }

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  async createConversation(personId: string, mode: ConversationMode): Promise<Conversation> {
    const { rows } = await this.db.query<ConversationRow>(
      `insert into conversations (person_id, mode)
       values ($1, $2)
       returning *`,
      [personId, mode],
    );
    const row = rows[0];
    if (!row) fail('createConversation', 'insert returned no row');
    return mapConversation(row);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const { rows } = await this.db.query<ConversationRow>(
      'select * from conversations where id = $1',
      [conversationId],
    );
    const row = rows[0];
    return row ? mapConversation(row) : null;
  }

  async listConversations(personId?: string): Promise<Conversation[]> {
    const { rows } = personId
      ? await this.db.query<ConversationRow>(
          'select * from conversations where person_id = $1 order by started_at desc',
          [personId],
        )
      : await this.db.query<ConversationRow>(
          'select * from conversations order by started_at desc',
        );
    return rows.map(mapConversation);
  }

  async endConversation(conversationId: string): Promise<Conversation> {
    const { rows } = await this.db.query<ConversationRow>(
      `update conversations
          set ended_at = coalesce(ended_at, now())
        where id = $1
        returning *`,
      [conversationId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundError('Conversation not found');
    return mapConversation(row);
  }

  // -------------------------------------------------------------------------
  // Messages / flags
  // -------------------------------------------------------------------------

  async addMessage(input: {
    conversationId: string;
    role: 'user' | 'assistant';
    text: string;
  }): Promise<Message> {
    const { rows } = await this.db.query<MessageRow>(
      `insert into messages (conversation_id, role, text)
       values ($1, $2, $3)
       returning *`,
      [input.conversationId, input.role, maskSensitive(input.text)],
    );
    const row = rows[0];
    if (!row) fail('addMessage', 'insert returned no row');
    return mapMessage(row);
  }

  async getRecentMessages(conversationId: string, limit: number): Promise<Message[]> {
    const { rows } = await this.db.query<MessageRow>(
      `select * from (
         select * from messages
          where conversation_id = $1
          order by created_at desc
          limit $2
       ) recent
       order by created_at asc`,
      [conversationId, limit],
    );
    return rows.map(mapMessage);
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const { rows } = await this.db.query<MessageRow>(
      'select * from messages where conversation_id = $1 order by created_at asc',
      [conversationId],
    );
    return rows.map(mapMessage);
  }

  async addFlags(
    conversationId: string,
    messageId: string | null,
    stage: GuardrailStage,
    hits: GuardrailHit[],
  ): Promise<void> {
    if (hits.length === 0) return;

    const values: unknown[] = [];
    const placeholders = hits.map((hit, index) => {
      const base = index * 5;
      values.push(
        conversationId,
        messageId,
        stage,
        hit.category,
        hit.detail ? maskSensitive(hit.detail) : null,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await this.db.query(
      `insert into guardrail_flags
         (conversation_id, message_id, stage, category, detail)
       values ${placeholders.join(', ')}`,
      values,
    );
  }

  async listFlags(conversationId: string): Promise<GuardrailFlag[]> {
    const { rows } = await this.db.query<GuardrailFlagRow>(
      'select * from guardrail_flags where conversation_id = $1 order by created_at asc',
      [conversationId],
    );
    return rows.map(mapGuardrailFlag);
  }
}

let cached: Store | null = null;

/** Lazy so the API can start (and serve /health) before Postgres is configured. */
export function getStore(): Store {
  if (!cached) {
    try {
      cached = new Store(createDbPool());
    } catch (error) {
      throw new ConfigError(
        error instanceof Error ? error.message : 'The database is not configured',
      );
    }
  }
  return cached;
}

export async function closeStore(): Promise<void> {
  // The pool is created lazily; export for graceful shutdown and tests.
  await cached?.close();
  cached = null;
}
