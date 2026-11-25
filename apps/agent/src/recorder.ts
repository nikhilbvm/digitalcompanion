import type { SupabaseClient } from '@supabase/supabase-js';
import { maskSensitive, type GuardrailHit } from '@companion/core';

/**
 * Persists voice turns and flags. Failures are logged but never thrown into
 * the voice pipeline: a database hiccup must not end a conversation.
 */
export class Recorder {
  constructor(
    private readonly client: SupabaseClient,
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
      const { data, error } = await this.client
        .from('messages')
        .insert({
          conversation_id: this.conversationId,
          role,
          text: safeText,
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      if (hits.length > 0) {
        const rows = hits.map((hit) => ({
          conversation_id: this.conversationId,
          message_id: (data as { id: string }).id,
          stage,
          category: hit.category,
          detail: hit.detail ? maskSensitive(hit.detail) : null,
        }));
        const { error: flagError } = await this.client.from('guardrail_flags').insert(rows);
        if (flagError) throw new Error(flagError.message);
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
      const { error } = await this.client
        .from('conversations')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', this.conversationId)
        .is('ended_at', null);
      if (error) throw new Error(error.message);
    } catch (error) {
      console.error(
        '[agent] failed to end conversation:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
