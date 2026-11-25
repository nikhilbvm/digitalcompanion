// Adapted from the Apache-2.0 LiveKit Agents Anthropic plugin.
// Changes: effort low, cached persona block, per-turn safety instruction,
// refusal fallback, no sampling params, no tool support (the companion is
// tool-free in Part 1).
import Anthropic from '@anthropic-ai/sdk';
import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  DEFAULT_API_CONNECT_OPTIONS,
  llm,
  type APIConnectOptions,
} from '@livekit/agents';
import { REFUSAL_FALLBACK } from '@companion/core';

export interface CompanionLLMOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  client?: Anthropic;
}

const DEFAULTS: CompanionLLMOptions = {
  model: 'claude-haiku-5-5',
  maxTokens: 300,
  effort: 'low',
};

export class CompanionAnthropicLLM extends llm.LLM {
  #opts: CompanionLLMOptions;
  #client: Anthropic;
  #turnInstruction: string | null = null;

  constructor(opts: Partial<CompanionLLMOptions> = {}) {
    super();
    this.#opts = { ...DEFAULTS, ...opts };

    if (!this.#opts.apiKey && !this.#opts.client) {
      throw new Error('ANTHROPIC_API_KEY is required for the voice agent');
    }

    this.#client =
      this.#opts.client ??
      new Anthropic({
        baseURL: this.#opts.baseURL,
        apiKey: this.#opts.apiKey,
        maxRetries: 0,
      });
  }

  label(): string {
    return 'companion.anthropic';
  }

  override get model(): string {
    return this.#opts.model;
  }

  override get provider(): string {
    try {
      return new URL(this.#client.baseURL).host;
    } catch {
      return 'api.anthropic.com';
    }
  }

  /**
   * Set a one-turn safety instruction (from the input guardrail). The next
   * LLM call includes it as a separate system block, then it is cleared.
   */
  setTurnInstruction(instruction: string | null): void {
    this.#turnInstruction = instruction;
  }

  override chat({
    chatCtx,
    connOptions = DEFAULT_API_CONNECT_OPTIONS,
  }: {
    chatCtx: llm.ChatContext;
    connOptions?: APIConnectOptions;
  }): CompanionAnthropicLLMStream {
    const turnInstruction = this.#turnInstruction;
    this.#turnInstruction = null;

    const { system, messages } = buildAnthropicContext(chatCtx, turnInstruction);

    const requestParams: Anthropic.MessageCreateParamsStreaming = {
      model: this.#opts.model,
      max_tokens: this.#opts.maxTokens ?? 300,
      system: system.length > 0 ? system : undefined,
      messages,
      stream: true,
      output_config: { effort: this.#opts.effort ?? 'low' },
    };

    return new CompanionAnthropicLLMStream(
      this,
      this.#client,
      requestParams,
      chatCtx,
      connOptions,
    );
  }
}

function buildAnthropicContext(
  chatCtx: llm.ChatContext,
  turnInstruction: string | null,
): {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
} {
  const system: Anthropic.TextBlockParam[] = [];
  const raw: Anthropic.MessageParam[] = [];

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

  // Cache the fixed persona/instruction prefix. The persona is stable across
  // turns; the per-turn instruction is appended after the breakpoint.
  if (system[0]) {
    system[0].cache_control = { type: 'ephemeral' };
  }

  const messages: Anthropic.MessageParam[] = [];
  for (const message of raw) {
    const previous = messages[messages.length - 1];
    if (previous && previous.role === message.role) {
      const previousContent = Array.isArray(previous.content)
        ? previous.content
        : [{ type: 'text' as const, text: previous.content as string }];
      const currentContent = Array.isArray(message.content)
        ? message.content
        : [{ type: 'text' as const, text: message.content as string }];
      previous.content = [...previousContent, ...currentContent];
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

class CompanionAnthropicLLMStream extends llm.LLMStream {
  #client: Anthropic;
  #requestParams: Anthropic.MessageCreateParamsStreaming;
  #requestId = '';
  #inputTokens = 0;
  #outputTokens = 0;
  #cacheCreationTokens = 0;
  #cacheReadTokens = 0;

  constructor(
    llmInstance: CompanionAnthropicLLM,
    client: Anthropic,
    requestParams: Anthropic.MessageCreateParamsStreaming,
    chatCtx: llm.ChatContext,
    connOptions: APIConnectOptions,
  ) {
    super(llmInstance, { chatCtx, connOptions });
    this.#client = client;
    this.#requestParams = requestParams;
  }

  protected async run(): Promise<void> {
    let retryable = true;
    this.#requestId = '';
    this.#inputTokens = 0;
    this.#outputTokens = 0;
    this.#cacheCreationTokens = 0;
    this.#cacheReadTokens = 0;

    try {
      const stream = await this.#client.messages.create(this.#requestParams, {
        timeout: this.connOptions.timeoutMs,
        signal: this.abortController.signal,
      });

      let stopReason: string | null = null;

      for await (const event of stream) {
        if (event.type === 'message_start') {
          this.#requestId = event.message.id;
          this.#inputTokens = event.message.usage.input_tokens;
          this.#outputTokens = event.message.usage.output_tokens;
          this.#cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
          this.#cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
        } else if (event.type === 'message_delta') {
          this.#outputTokens = event.usage.output_tokens;
          stopReason = event.delta.stop_reason ?? stopReason;
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          if (text) {
            this.queue.put({
              id: this.#requestId,
              delta: { role: 'assistant', content: text },
            });
            retryable = false;
          }
        }
      }

      if (stopReason === 'refusal') {
        // A refusal can arrive after a partial reply; append the safe fallback
        // either way so the turn always ends with a gentle line.
        this.queue.put({
          id: this.#requestId,
          delta: { role: 'assistant', content: REFUSAL_FALLBACK },
        });
        retryable = false;
      }

      const promptTokens =
        this.#inputTokens + this.#cacheCreationTokens + this.#cacheReadTokens;
      this.queue.put({
        id: this.#requestId,
        usage: {
          completionTokens: this.#outputTokens,
          promptTokens,
          totalTokens: promptTokens + this.#outputTokens,
          promptCachedTokens: this.#cacheReadTokens,
          cacheCreationTokens: this.#cacheCreationTokens,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Anthropic.APIError) {
        if (error.status === 408) {
          throw new APITimeoutError({ message: error.message, options: { retryable } });
        }
        throw new APIStatusError({
          message: error.message,
          options: {
            statusCode: error.status,
            body: error.error as object,
            retryable: retryable && (error.status === 429 || error.status >= 500),
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
