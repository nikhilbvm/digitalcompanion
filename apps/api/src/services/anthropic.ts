import Anthropic from '@anthropic-ai/sdk';
import type { Message, SystemPromptBlock } from '@companion/core';
import { config } from '../config.js';
import { ConfigError } from '../errors.js';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new ConfigError('ANTHROPIC_API_KEY is not set');
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2 });
  }
  return client;
}

export interface AnthropicReplyParams {
  system: SystemPromptBlock[];
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export type AnthropicReplyEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason: string | null; refusalCategory: string | null };

/**
 * Stream a Haiku reply with the project's request policy:
 * no sampling params, no prefill, low effort, cached persona block.
 */
export async function* streamAnthropicReply(
  params: AnthropicReplyParams,
): AsyncGenerator<AnthropicReplyEvent> {
  const anthropic = getAnthropic();

  const stream = await anthropic.messages.create(
    {
      model: config.anthropicModel,
      max_tokens: params.maxTokens ?? config.maxReplyTokens,
      system: params.system as Anthropic.TextBlockParam[],
      messages: params.messages,
      stream: true,
      output_config: { effort: config.anthropicEffort },
    },
    { signal: params.signal },
  );

  let stopReason: string | null = null;
  let refusalCategory: string | null = null;

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'text', text: event.delta.text };
    } else if (event.type === 'message_delta') {
      stopReason = event.delta.stop_reason ?? stopReason;
      const details = (
        event.delta as unknown as { stop_details?: { category?: string | null } | null }
      ).stop_details;
      if (details?.category) refusalCategory = details.category;
    }
  }

  yield { type: 'done', stopReason, refusalCategory };
}

export function toAnthropicMessages(
  history: Message[],
  currentUserText: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = history.map((message) => ({
    role: message.role,
    content: message.text,
  }));

  // Anthropic requires the conversation to start with a user turn.
  while (messages[0]?.role === 'assistant') messages.shift();

  messages.push({ role: 'user', content: currentUserText });
  return messages;
}
