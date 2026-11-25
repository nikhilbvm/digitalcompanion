import OpenAI from 'openai';
import type { ChatTurnMessage, SystemPromptBlock } from '@companion/core';
import { config } from '../config.js';

export interface OpenRouterReplyParams {
  system: SystemPromptBlock[];
  messages: ChatTurnMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export type OpenRouterReplyEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason: string | null; refusalCategory: string | null };

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openrouterApiKey,
      baseURL: config.openrouterBaseUrl,
      maxRetries: 1,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/nikhilbvm/digitalcompanion',
        'X-Title': 'Digital Companion',
      },
    });
  }
  return client;
}

/**
 * Stream a chat completion through OpenRouter's OpenAI-compatible API.
 * Anthropic-style cache_control is attached to the system content blocks so
 * the persona/profile prefix is cached per person; reasoning.effort is mapped
 * to Claude's output_config.effort by OpenRouter.
 */
export async function* streamOpenRouterReply(
  params: OpenRouterReplyParams,
): AsyncGenerator<OpenRouterReplyEvent> {
  const systemContent = params.system.map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cache_control ? { cache_control: block.cache_control } : {}),
  }));

  const provider = config.openrouterProvider
    ? {
        order: [config.openrouterProvider],
        allow_fallbacks: config.openrouterAllowFallbacks,
        data_collection: config.openrouterDataCollection,
      }
    : {
        allow_fallbacks: config.openrouterAllowFallbacks,
        data_collection: config.openrouterDataCollection,
      };

  const body = {
    model: config.openrouterModel,
    max_tokens: params.maxTokens ?? config.maxReplyTokens,
    messages: [
      { role: 'system', content: systemContent },
      ...params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
    stream: true,
    stream_options: { include_usage: true },
    reasoning: { effort: config.llmEffort },
    provider,
  } as unknown as OpenAI.ChatCompletionCreateParamsStreaming;

  const stream = await getClient().chat.completions.create(body, {
    signal: params.signal,
  });

  let stopReason: string | null = null;
  let nativeFinishReason: string | null = null;
  let refused = false;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      yield { type: 'text', text: delta.content };
    }
    if ((delta as { refusal?: string | null } | undefined)?.refusal) {
      refused = true;
    }
    if (choice.finish_reason) {
      stopReason = choice.finish_reason;
      nativeFinishReason =
        (choice as { native_finish_reason?: string | null }).native_finish_reason ?? null;
    }
  }

  const refusalCategory =
    refused || stopReason === 'content_filter' || nativeFinishReason === 'refusal'
      ? 'refusal'
      : null;

  yield { type: 'done', stopReason, refusalCategory };
}
