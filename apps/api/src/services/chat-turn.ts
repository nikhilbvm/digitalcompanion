import {
  REFUSAL_FALLBACK,
  SentenceAccumulator,
  buildSystemPrompt,
  checkInputPatterns,
  classifyInput,
  filterOutputSentence,
  highestGuardrailCategory,
  safetyInstructionFor,
  safetyLineFor,
  type ChatRequest,
  type GuardrailCategory,
  type GuardrailHit,
} from '@companion/core';
import { config } from '../config.js';
import { NotFoundError } from '../errors.js';
import type { SseWriter } from '../sse.js';
import { streamReply, toChatMessages } from './llm.js';
import type { Store } from './store.js';

const EMPTY_REPLY = "I'm here with you. What would you like to talk about?";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export interface ChatTurnParams {
  store: Store;
  writer: SseWriter;
  request: ChatRequest;
  signal: AbortSignal;
}

/**
 * One text-chat turn: guardrail → Claude → output filter → persistence.
 * Guardrail classification runs in parallel with generation; a late
 * classification that raises severity appends a deterministic safety line.
 */
export async function runChatTurn({
  store,
  writer,
  request,
  signal,
}: ChatTurnParams): Promise<void> {
  const startedAt = Date.now();
  let firstTokenAt: number | null = null;

  const person = await store.getPerson(request.personId);
  if (!person) throw new NotFoundError('Person not found');

  let conversation = request.conversationId
    ? await store.getConversation(request.conversationId)
    : null;

  if (conversation && conversation.personId !== person.id) {
    // Do not reveal another person's conversation.
    throw new NotFoundError('Conversation not found');
  }
  if (!conversation || conversation.endedAt) {
    conversation = await store.createConversation(person.id, 'text');
  }

  const patterns = checkInputPatterns(request.message);
  let category: GuardrailCategory = highestGuardrailCategory(
    patterns.hits.map((hit) => hit.category),
  );

  const history = await store.getRecentMessages(conversation.id, config.chatHistoryLimit);
  const userMessage = await store.addMessage({
    conversationId: conversation.id,
    role: 'user',
    text: request.message,
  });
  await store.addFlags(conversation.id, userMessage.id, 'input', patterns.hits);

  writer.event('meta', {
    conversationId: conversation.id,
    mode: 'text',
    category,
  });

  for (const hit of patterns.hits) {
    writer.event('flag', { ...hit, stage: 'input' });
  }

  // Start the classifier alongside generation. It never blocks the first token.
  const classificationPromise = classifyInput(patterns.maskedText);

  const safetyInstruction = safetyInstructionFor(category);
  const system = buildSystemPrompt(person);
  if (safetyInstruction) {
    system.push({
      type: 'text',
      text: `Instruction for this turn only: ${safetyInstruction}`,
    });
  }

  const messages = toChatMessages(history, patterns.maskedText);
  const accumulator = new SentenceAccumulator();
  const outputFlags: GuardrailHit[] = [];
  let safeReply = '';
  let emitted = false;
  let stopReason: string | null = null;

  const emit = (text: string): void => {
    if (!text.trim()) return;
    const prefix = emitted ? ' ' : '';
    writer.event('delta', { text: prefix + text });
    safeReply += (safeReply ? ' ' : '') + text;
    emitted = true;
  };

  const handleSentence = (sentence: string): void => {
    const filtered = filterOutputSentence(sentence);
    outputFlags.push(...filtered.flags);
    for (const flag of filtered.flags) {
      writer.event('flag', { ...flag, stage: 'output' });
    }
    emit(filtered.text);
  };

  try {
    for await (const event of streamReply({
      system,
      messages,
      signal,
    })) {
      if (event.type === 'text') {
        if (firstTokenAt === null) firstTokenAt = Date.now() - startedAt;
        for (const sentence of accumulator.push(event.text)) handleSentence(sentence);
      } else if (event.type === 'done') {
        stopReason = event.stopReason;
      }
    }

    for (const sentence of accumulator.flush()) handleSentence(sentence);

    // The classifier usually finishes long before the reply does.
    const classification = await withTimeout(classificationPromise, 600);
    if (classification && classification.category !== 'none') {
      const hit: GuardrailHit = {
        category: classification.category,
        detail: `classifier: ${classification.category} (${classification.confidence.toFixed(2)})`,
        source: 'classifier',
        confidence: classification.confidence,
      };
      await store.addFlags(conversation.id, userMessage.id, 'input', [hit]);
      writer.event('flag', { ...hit, stage: 'input' });

      const upgraded = highestGuardrailCategory([category, classification.category]);
      if (upgraded !== category) {
        category = upgraded;
        const line = safetyLineFor(category);
        if (line) emit(line);
      }
    }

    if (stopReason === 'refusal') {
      emit(REFUSAL_FALLBACK);
    }
    if (!safeReply.trim()) {
      emit(EMPTY_REPLY);
    }

    const assistantMessage = await store.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: safeReply,
    });
    await store.addFlags(conversation.id, assistantMessage.id, 'output', outputFlags);

    writer.event('done', {
      conversationId: conversation.id,
      category,
      stopReason,
    });
  } catch (error) {
    const aborted = signal.aborted;
    if (!aborted) {
      console.error('[chat] turn failed:', error instanceof Error ? error.message : error);
      writer.event('error', {
        message: 'The companion had trouble replying. Please try again.',
      });
    }

    // Keep a partial safe reply rather than losing the turn.
    if (safeReply.trim()) {
      try {
        const assistantMessage = await store.addMessage({
          conversationId: conversation.id,
          role: 'assistant',
          text: safeReply,
        });
        await store.addFlags(conversation.id, assistantMessage.id, 'output', outputFlags);
      } catch (persistError) {
        console.error(
          '[chat] failed to persist partial reply:',
          persistError instanceof Error ? persistError.message : persistError,
        );
      }
    }
  } finally {
    writer.close();
    console.log(
      JSON.stringify({
        event: 'chat_turn',
        conversationId: conversation.id,
        inputCategory: category,
        inputFlags: patterns.hits.length,
        outputFlags: outputFlags.length,
        ttftMs: firstTokenAt,
        totalMs: Date.now() - startedAt,
        aborted: signal.aborted,
      }),
    );
  }
}
