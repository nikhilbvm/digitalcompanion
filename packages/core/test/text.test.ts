import { describe, expect, it } from 'vitest';
import { SentenceAccumulator, splitSentences } from '../src/index.js';

describe('splitSentences', () => {
  it('splits on sentence punctuation', () => {
    expect(splitSentences('Hello there. How are you? I am fine!')).toEqual([
      'Hello there.',
      'How are you?',
      'I am fine!',
    ]);
  });

  it('does not split decimals or common abbreviations', () => {
    expect(splitSentences('Dr. Smith gave 3.5 mg. Then he left.')).toEqual([
      'Dr. Smith gave 3.5 mg.',
      'Then he left.',
    ]);
  });

  it('keeps a final sentence without punctuation', () => {
    expect(splitSentences('One. Two')).toEqual(['One.', 'Two']);
  });
});

describe('SentenceAccumulator', () => {
  it('emits complete sentences as chunks arrive', () => {
    const acc = new SentenceAccumulator();
    expect(acc.push('Hello')).toEqual([]);
    expect(acc.push(' there. How')).toEqual(['Hello there.']);
    expect(acc.push(' are you?')).toEqual(['How are you?']);
    expect(acc.flush()).toEqual([]);
  });

  it('flushes a trailing fragment', () => {
    const acc = new SentenceAccumulator();
    expect(acc.push('Just a fragment')).toEqual([]);
    expect(acc.flush()).toEqual(['Just a fragment']);
  });
});
