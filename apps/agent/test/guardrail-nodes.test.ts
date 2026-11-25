import { describe, expect, it } from 'vitest';
import { SAFE_REPLACEMENT, type GuardrailHit } from '@companion/core';
import { filterLlmStream, filterTextForTts } from '../src/guardrail-nodes.js';

function chunkStream(chunks: Array<{ id: string; content: string }>): ReadableStream<{
  id: string;
  delta: { role: 'assistant'; content: string };
}> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue({
          id: chunk.id,
          delta: { role: 'assistant' as const, content: chunk.content },
        });
      }
      controller.close();
    },
  });
}

async function readChunkText(
  stream: ReadableStream<{ delta?: { content?: string } } | string>,
): Promise<string> {
  let text = '';
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += typeof value === 'string' ? value : (value.delta?.content ?? '');
  }
  return text;
}

describe('filterLlmStream', () => {
  it('replaces an unsafe sentence before it reaches context or TTS', async () => {
    let captured = '';
    let flags: GuardrailHit[] = [];

    const filtered = filterLlmStream(
      chunkStream([
        { id: '1', content: 'Hello Mary. ' },
        { id: '2', content: 'What is your card number? ' },
        { id: '3', content: 'Let us talk about your garden.' },
      ]),
      async (safeText, outputFlags) => {
        captured = safeText;
        flags = outputFlags;
      },
    );

    const reader = filtered.getReader();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (typeof value !== 'string') text += value.delta?.content ?? '';
    }

    expect(text).toContain('Hello Mary.');
    expect(text).toContain(SAFE_REPLACEMENT);
    expect(text).not.toContain('card number');
    expect(text).toContain('Let us talk about your garden.');
    expect(captured).toContain(SAFE_REPLACEMENT);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((flag) => flag.source === 'output')).toBe(true);
  });

  it('leaves safe text unchanged', async () => {
    const filtered = filterLlmStream(
      chunkStream([{ id: '1', content: 'That sounds like a lovely memory.' }]),
      async () => undefined,
    );

    const text = await readChunkText(filtered);
    expect(text).toContain('That sounds like a lovely memory.');
    expect(text).not.toContain(SAFE_REPLACEMENT);
  });
});

describe('filterTextForTts', () => {
  it('filters a non-LLM say path', async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('Please send money to this account. ');
        controller.enqueue('Have a nice day.');
        controller.close();
      },
    });

    let flags: GuardrailHit[] = [];
    const filtered = filterTextForTts(source, async (_text, outputFlags) => {
      flags = outputFlags;
    });

    let text = '';
    for await (const chunk of filtered) text += chunk;

    expect(text).toContain(SAFE_REPLACEMENT);
    expect(text).not.toContain('send money');
    expect(flags.length).toBeGreaterThan(0);
  });
});
