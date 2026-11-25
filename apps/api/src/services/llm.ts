import type { ChatTurnMessage, Message, SystemPromptBlock } from '@companion/core';
import { config } from '../config.js';
import { streamAnthropicReply } from './anthropic.js';
import { streamOpenRouterReply } from './openrouter.js';

export interface ReplyParams {
  system: SystemPromptBlock[];
  messages: ChatTurnMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ReplyEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason: string | null; refusalCategory: string | null };

/**
 * Provider switch for text chat. OpenRouter is the default when configured;
 * direct Anthropic remains available with LLM_PROVIDER=anthropic.
 */
export function streamReply(params: ReplyParams): AsyncGenerator<ReplyEvent> {
  return config.llmProvider === 'openrouter'
    ? streamOpenRouterReply(params)
    : streamAnthropicReply(params);
}

export function toChatMessages(history: Message[], currentUserText: string): ChatTurnMessage[] {
  const messages: ChatTurnMessage[] = history.map((message) => ({
    role: message.role,
    content: message.text,
  }));

  // Both providers expect the conversation to start with a user turn.
  while (messages[0]?.role === 'assistant') messages.shift();

  messages.push({ role: 'user', content: currentUserText });
  return messages;
}
