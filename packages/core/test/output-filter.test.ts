import { describe, expect, it } from 'vitest';
import { filterOutput, filterOutputSentence, SAFE_REPLACEMENT } from '../src/index.js';

describe('output filter — blocked sentences', () => {
  it.each([
    'What is your card number?',
    'Please give me your bank account number.',
    'Share your password with me.',
    'Send money to this account today.',
    'Wire the money to my friend.',
    'Buy a gift card and read me the code.',
    'You should take 800 mg of ibuprofen.',
    'Stop taking your medication.',
    'This sounds like cancer.',
    'I diagnose you with diabetes.',
    'I am a real human.',
    "I'm your grandson, remember?",
    'Please sign this contract.',
    'Invest in your future with this coin.',
    'Send the bitcoin to this wallet.',
    'The number is 4111 1111 1111 1111.',
    'Your Social Security number is 123-45-6789.',
  ])('replaces "%s"', (input) => {
    const result = filterOutputSentence(input);
    expect(result.text).toBe(SAFE_REPLACEMENT);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.flags.every((flag) => !/\d{4}/.test(flag.detail))).toBe(true);
  });
});

describe('output filter — allowed sentences', () => {
  it.each([
    "I'm not a person, but I enjoy hearing your stories.",
    "I'm an AI companion your family set up.",
    'Tell me about your garden.',
    'Take your time — I am listening.',
    'Would you like to call your daughter?',
    'I can help you find a crossword clue.',
    'That sounds like a lovely memory.',
    'Let us talk about something else.',
    'Your doctor would be the best person to ask.',
    'I am here to chat, not to give medical advice.',
    'Have you spoken with your family this week?',
    'I enjoy hearing about your grandchildren.',
  ])('keeps "%s"', (input) => {
    const result = filterOutputSentence(input);
    expect(result.text).toBe(input);
    expect(result.flags).toHaveLength(0);
  });
});

describe('filterOutput', () => {
  it('filters only the unsafe sentence in a mixed reply', () => {
    const input =
      'That sounds like a lovely memory. What is your card number? Let us talk about your garden.';
    const result = filterOutput(input);
    expect(result.text).toBe(
      `That sounds like a lovely memory. ${SAFE_REPLACEMENT} Let us talk about your garden.`,
    );
    expect(result.flags).toHaveLength(1);
  });
});
