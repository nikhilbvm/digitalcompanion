import { maskSensitive, type DbPool, type GuardrailHit } from '@companion/core';

/**
 * Persists voice turns and flags. Failures are logged but never thrown into
 * the voice pipeline: a database hiccup must not end a conversation.
 */
export class Recorder {
  constructor(
    private readonly db: DbPool,
    readonly conversationId: string,
  ) {}

  async recordUser(text: string, hits: GuardrailHit[]): Promise<void> {
    await this.record('user', text, 'input', hits);
  }

  async recordAssistant(text: string, hits: GuardrailHit[]): Promise<void> {
    await this.record('assistant', text, 'output', hits);
  }

  private async record(
    role: 'user' | 'assistant',
    text: string,
    stage: 'input' | 'output',
    hits: GuardrailHit[],
  ): Promise<void> {
    const safeText = maskSensitive(text).trim();
    if (!safeText) return;

    try {
      const { rows } = await this.db.query<{ id: string }>(
        `insert into messages (conversation_id, role, text)
         values ($1, $2, $3)
         returning id`,
        [this.conversationId, role, safeText],
      );

      const messageId = rows[0]?.id;
      if (!messageId) throw new Error('message insert returned no id');

      if (hits.length > 0) {
        const values: unknown[] = [];
        const placeholders = hits.map((hit, index) => {
          const base = index * 5;
          values.push(
            this.conversationId,
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
    } catch (error) {
      console.error(
        '[agent] failed to persist turn:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async endConversation(): Promise<void> {
    try {
      await this.db.query(
        `update conversations
            set ended_at = coalesce(ended_at, now())
          where id = $1`,
        [this.conversationId],
      );
    } catch (error) {
      console.error(
        '[agent] failed to end conversation:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
