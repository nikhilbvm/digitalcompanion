import type { AudioFrame } from '@livekit/rtc-node';
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
