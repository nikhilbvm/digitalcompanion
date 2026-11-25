import type { AudioFrame } from '@livekit/rtc-node';
import type { ChatChunk } from '@livekit/agents';
import {
  SentenceAccumulator,
  filterOutputSentence,
  type GuardrailHit,
} from '@companion/core';

/**
 * Filter the LLM text stream sentence by sentence before it reaches TTS, and
 * report the safe text plus flags once the stream finishes.
 */
export async function* filterTextForTts(
  source: ReadableStream<string> | AsyncIterable<string>,
  onComplete: (safeText: string, flags: GuardrailHit[]) => Promise<void>,
): AsyncGenerator<string> {
  const accumulator = new SentenceAccumulator();
  const parts: string[] = [];
  const flags: GuardrailHit[] = [];
  let completed = false;

  const handle = (sentence: string): string | null => {
    const filtered = filterOutputSentence(sentence);
    flags.push(...filtered.flags);
    parts.push(filtered.text);
    return filtered.text ? `${filtered.text} ` : null;
  };

  try {
    for await (const chunk of source) {
      for (const sentence of accumulator.push(chunk)) {
        const safe = handle(sentence);
        if (safe) yield safe;
      }
    }
    for (const sentence of accumulator.flush()) {
      const safe = handle(sentence);
      if (safe) yield safe;
    }

    completed = true;
    if (parts.length > 0) await onComplete(parts.join(' ').trim(), flags);
  } finally {
    if (!completed && parts.length > 0) {
      await onComplete(parts.join(' ').trim(), flags);
    }
  }
}

/**
 * Filter the LLM output stream itself, so the chat context, the live
 * transcription and TTS all receive safe text. Runs before LiveKit builds the
 * assistant message.
 */
export function filterLlmStream(
  source: ReadableStream<ChatChunk | string>,
  onComplete: (safeText: string, flags: GuardrailHit[]) => Promise<void>,
): ReadableStream<ChatChunk | string> {
  const reader = source.getReader();
  const accumulator = new SentenceAccumulator();
  const parts: string[] = [];
  const flags: GuardrailHit[] = [];

  const handle = (sentence: string): string | null => {
    const filtered = filterOutputSentence(sentence);
    flags.push(...filtered.flags);
    parts.push(filtered.text);
    return filtered.text ? `${filtered.text} ` : null;
  };

  return new ReadableStream<ChatChunk | string>({
    async start(controller) {
      let lastId = 'filtered';
      let finalized = false;

      const finish = async (): Promise<void> => {
        if (finalized) return;
        finalized = true;
        if (parts.length > 0) {
          await onComplete(parts.join(' ').trim(), flags);
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          if (typeof value === 'string') {
            for (const sentence of accumulator.push(value)) {
              const safe = handle(sentence);
              if (safe) controller.enqueue(safe);
            }
            continue;
          }

          lastId = value.id || lastId;
          const content = value.delta?.content;
          if (!content) {
            controller.enqueue(value);
            continue;
          }

          for (const sentence of accumulator.push(content)) {
            const safe = handle(sentence);
            if (safe) {
              controller.enqueue({
                ...value,
                delta: { ...value.delta, role: 'assistant', content: safe },
              });
            }
          }
        }

        for (const sentence of accumulator.flush()) {
          const safe = handle(sentence);
          if (safe) {
            controller.enqueue({ id: lastId, delta: { role: 'assistant', content: safe } });
          }
        }

        await finish();
        if (controller.desiredSize !== null) controller.close();
      } catch (error) {
        // A barge-in aborts the source stream; keep whatever was already safe.
        await finish();
        if (controller.desiredSize !== null) controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Wrap TTS audio so the first frame can be timestamped for the latency log.
 */
export function tapFirstAudio(
  stream: ReadableStream<AudioFrame> | null,
  onFirstFrame: () => void,
): ReadableStream<AudioFrame> | null {
  if (!stream) return null;
  let tapped = false;

  return new ReadableStream<AudioFrame>({
    async start(controller) {
      try {
        for await (const frame of stream) {
          if (!tapped) {
            tapped = true;
            onFirstFrame();
          }
          controller.enqueue(frame);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return stream.cancel(reason);
    },
  });
}
