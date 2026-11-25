import OpenAI from 'openai';
import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  DEFAULT_API_CONNECT_OPTIONS,
  llm,
  type APIConnectOptions,
} from '@livekit/agents';
import { REFUSAL_FALLBACK } from '@companion/core';

export interface CompanionOpenRouterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Provider slug to pin (e.g. `anthropic`); empty disables pinning. */
  provider?: string;
  allowFallbacks?: boolean;
  dataCollection?: 'allow' | 'deny';
  client?: OpenAI;
}

interface OpenRouterTurn {
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class CompanionOpenRouterLLM extends llm.LLM {
  #opts: CompanionOpenRouterOptions;
  #client: OpenAI;
  #turnInstruction: string | null = null;

  constructor(opts: CompanionOpenRouterOptions) {
    super();
    this.#opts = { maxTokens: 300, effort: 'low', ...opts };
    this.#client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey,
        baseURL: opts.baseUrl ?? 'https://openrouter.ai/api/v1',
        maxRetries: 0,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/nikhilbvm/digitalcompanion',
          'X-Title': 'Digital Companion',
        },
      });
  }

  label(): string {
    return 'companion.openrouter';
  }

  override get model(): string {
    return this.#opts.model;
  }

  override get provider(): string {
    return 'openrouter.ai';
  }

  setTurnInstruction(instruction: string | null): void {
    this.#turnInstruction = instruction;
  }

  override chat({
    chatCtx,
    connOptions = DEFAULT_API_CONNECT_OPTIONS,
  }: {
    chatCtx: llm.ChatContext;
    connOptions?: APIConnectOptions;
  }): CompanionOpenRouterLLMStream {
    const turnInstruction = this.#turnInstruction;
    this.#turnInstruction = null;

    const { system, messages } = buildOpenRouterContext(chatCtx, turnInstruction);

    const provider = this.#opts.provider
      ? {
          order: [this.#opts.provider],
          allow_fallbacks: this.#opts.allowFallbacks ?? false,
          data_collection: this.#opts.dataCollection ?? 'deny',
        }
      : {
          allow_fallbacks: this.#opts.allowFallbacks ?? false,
          data_collection: this.#opts.dataCollection ?? 'deny',
        };

    const body = {
      model: this.#opts.model,
      max_tokens: this.#opts.maxTokens ?? 300,
      messages: [
        { role: 'system', content: system },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      stream: true,
      stream_options: { include_usage: true },
      reasoning: { effort: this.#opts.effort ?? 'low' },
      provider,
    } as unknown as OpenAI.ChatCompletionCreateParamsStreaming;

    return new CompanionOpenRouterLLMStream(
      this,
      this.#client,
      body,
      chatCtx,
      connOptions,
    );
  }
}

function buildOpenRouterContext(
  chatCtx: llm.ChatContext,
  turnInstruction: string | null,
): OpenRouterTurn {
  const system: OpenRouterTurn['system'] = [];
  const raw: OpenRouterTurn['messages'] = [];

  for (const item of chatCtx.items) {
    if (item.type !== 'message') continue;
    const text = item.rawTextContent ?? '';

    if (item.role === 'system' || item.role === 'developer') {
      if (text) system.push({ type: 'text', text });
    } else if (item.role === 'user' || item.role === 'assistant') {
      raw.push({ role: item.role, content: text });
    }
  }

  if (turnInstruction) {
    system.push({
      type: 'text',
      text: `Instruction for this turn only: ${turnInstruction}`,
    });
  }

  // Cache the stable instructions prefix (persona + profile) per person.
  if (system[0]) {
    system[0].cache_control = { type: 'ephemeral' };
  }

  const messages: OpenRouterTurn['messages'] = [];
  for (const message of raw) {
    const previous = messages[messages.length - 1];
    if (previous && previous.role === message.role) {
      previous.content += `\n${message.content}`;
    } else {
      messages.push({ ...message });
    }
  }

  if (messages.length === 0 || messages[0]?.role !== 'user') {
    messages.unshift({ role: 'user', content: '(empty)' });
  }
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: '.' });
  }

  return { system, messages };
}

interface UsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

class CompanionOpenRouterLLMStream extends llm.LLMStream {
  #client: OpenAI;
  #body: OpenAI.ChatCompletionCreateParamsStreaming;
  #requestId = '';
  #promptTokens = 0;
  #completionTokens = 0;
  #cachedTokens = 0;

  constructor(
    llmInstance: CompanionOpenRouterLLM,
    client: OpenAI,
    body: OpenAI.ChatCompletionCreateParamsStreaming,
    chatCtx: llm.ChatContext,
    connOptions: APIConnectOptions,
  ) {
    super(llmInstance, { chatCtx, connOptions });
    this.#client = client;
    this.#body = body;
  }

  protected async run(): Promise<void> {
    let retryable = true;
    let emittedText = false;
    this.#requestId = '';
    this.#promptTokens = 0;
    this.#completionTokens = 0;
    this.#cachedTokens = 0;

    try {
      const stream = await this.#client.chat.completions.create(this.#body, {
        timeout: this.connOptions.timeoutMs,
        signal: this.abortController.signal,
      });

      let stopReason: string | null = null;
      let nativeFinishReason: string | null = null;
      let refused = false;

      for await (const chunk of stream) {
        if (chunk.id) this.#requestId = chunk.id;
        const choice = chunk.choices[0];
        if (choice) {
          const content = choice.delta?.content;
          if (typeof content === 'string' && content) {
            this.queue.put({
              id: this.#requestId,
              delta: { role: 'assistant', content },
            });
            emittedText = true;
            retryable = false;
          }
          if ((choice.delta as { refusal?: string | null } | undefined)?.refusal) {
            refused = true;
          }
          if (choice.finish_reason) {
            stopReason = choice.finish_reason;
            nativeFinishReason =
              (choice as { native_finish_reason?: string | null }).native_finish_reason ?? null;
          }
        }

        const usage = chunk.usage as UsageLike | null | undefined;
        if (usage) {
          this.#promptTokens = usage.prompt_tokens ?? this.#promptTokens;
          this.#completionTokens = usage.completion_tokens ?? this.#completionTokens;
          this.#cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? this.#cachedTokens;
        }
      }

      const refusedTurn =
        refused || stopReason === 'content_filter' || nativeFinishReason === 'refusal';
      if (refusedTurn) {
        this.queue.put({
          id: this.#requestId,
          delta: { role: 'assistant', content: REFUSAL_FALLBACK },
        });
        retryable = false;
      } else if (!emittedText) {
        this.queue.put({
          id: this.#requestId,
          delta: { role: 'assistant', content: REFUSAL_FALLBACK },
        });
      }

      this.queue.put({
        id: this.#requestId,
        usage: {
          completionTokens: this.#completionTokens,
          promptTokens: this.#promptTokens,
          totalTokens: this.#promptTokens + this.#completionTokens,
          promptCachedTokens: this.#cachedTokens,
        },
      });
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIError) {
        if (error.status === 408) {
          throw new APITimeoutError({ message: error.message, options: { retryable } });
        }
        throw new APIStatusError({
          message: error.message,
          options: {
            statusCode: error.status ?? 500,
            body: error.error as object,
            retryable: retryable && (error.status === 429 || (error.status ?? 0) >= 500),
          },
        });
      }
      throw new APIConnectionError({
        message: error instanceof Error ? error.message : String(error),
        options: { retryable },
      });
    }
  }
}
