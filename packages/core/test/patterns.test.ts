import { describe, expect, it } from 'vitest';
import {
  checkInputPatterns,
  findCardNumbers,
  luhnValid,
  maskSensitive,
  runInputGuardrail,
} from '../src/index.js';

describe('Luhn and card detection', () => {
  it('accepts a valid Visa test number', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
  });

  it('rejects an invalid checksum', () => {
    expect(luhnValid('4111111111111112')).toBe(false);
  });

  it('finds cards with spaces and hyphens', () => {
    expect(findCardNumbers('card 4111 1111 1111 1111 please')).toHaveLength(1);
    expect(findCardNumbers('card 5555-5555-5555-4444')).toHaveLength(1);
  });
});

describe('maskSensitive', () => {
  it.each([
    ['my card is 4111 1111 1111 1111', '[redacted-card]'],
    ['ssn 123-45-6789', '[redacted-ssn]'],
    ['my verification code is 483920', '[redacted-code]'],
    ['Medicare number 123456789', '[redacted-medicare]'],
  ])('masks %s', (input, token) => {
    const masked = maskSensitive(input);
    expect(masked).toContain(token);
    expect(masked).not.toMatch(/\d{4}/);
  });

  it('leaves ordinary numbers alone', () => {
    const text = 'I have 2 grandchildren and 3 cats.';
    expect(maskSensitive(text)).toBe(text);
  });
});

describe('checkInputPatterns', () => {
  it.each([
    ['My bank asked for my card number 4111 1111 1111 1111', 'scam'],
    ['I gave them my social security number 123-45-6789', 'scam'],
    ['The text said my one-time code is 884422', 'scam'],
    ['They wanted my Medicare number 123456789', 'scam'],
    ['They said buy gift cards and read the numbers', 'scam'],
    ['He told me to wire money to his account', 'scam'],
    ['My grandson is in jail and needs bitcoin', 'scam'],
    ['The IRS called and said I owe money', 'scam'],
    ["I fell and can't get up", 'emergency'],
    ['I have chest pain right now', 'emergency'],
    ['I am having trouble breathing', 'emergency'],
    ['I think I am having a stroke', 'emergency'],
    ['I want to kill myself', 'self_harm'],
    ['I have been feeling suicidal', 'self_harm'],
    ['I love gardening and old movies', 'none'],
    ['Can we talk about crosswords?', 'none'],
  ])('classifies "%s" as %s', (input, expected) => {
    const result = checkInputPatterns(input);
    const hasCategory = result.hits.some((hit) => hit.category === expected);
    if (expected === 'none') {
      expect(result.hits).toHaveLength(0);
    } else {
      expect(hasCategory).toBe(true);
    }
    expect(result.maskedText).not.toMatch(/\b\d{13,19}\b/);
  });
});

describe('runInputGuardrail', () => {
  it('adds a 911 instruction for emergencies', async () => {
    const result = await runInputGuardrail("I fell and can't get up", { classifier: false });
    expect(result.category).toBe('emergency');
    expect(result.safetyInstruction).toContain('911');
  });

  it('adds a 988 instruction for self-harm', async () => {
    const result = await runInputGuardrail('I want to kill myself', { classifier: false });
    expect(result.category).toBe('self_harm');
    expect(result.safetyInstruction).toContain('988');
  });

  it('lets the classifier raise the category', async () => {
    const result = await runInputGuardrail('I do not want to be here anymore', {
      classifier: async () => ({ category: 'self_harm', confidence: 0.91, degraded: false }),
    });
    expect(result.category).toBe('self_harm');
    expect(result.hits.some((hit) => hit.source === 'classifier')).toBe(true);
  });

  it('keeps patterns authoritative over a weaker classifier result', async () => {
    const result = await runInputGuardrail('I want to kill myself', {
      classifier: async () => ({ category: 'distress', confidence: 0.4, degraded: false }),
    });
    expect(result.category).toBe('self_harm');
  });
});
