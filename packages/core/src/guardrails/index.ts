import {
  EMERGENCY_LINE,
  SELF_HARM_LINE,
} from '../persona.js';
import type {
  GuardrailCategory,
  GuardrailHit,
  InputGuardrailResult,
} from '../types.js';
import { classifyInput, type ClassificationResult } from './classifier.js';
import { checkInputPatterns } from './patterns.js';

export { classifyInput, classificationSchema, type ClassificationResult } from './classifier.js';
export {
  checkInputPatterns,
  findCardNumbers,
  findMedicareNumber,
  findOtp,
  findSsn,
  luhnValid,
  maskSensitive,
  REDACTED_CARD,
  REDACTED_CODE,
  REDACTED_MEDICARE,
  REDACTED_SSN,
  type PatternResult,
} from './patterns.js';
export { filterOutput, filterOutputSentence } from './output.js';

const PRIORITY: Record<GuardrailCategory, number> = {
  none: 0,
  distress: 1,
  medical_question: 2,
  abuse: 3,
  scam: 4,
  emergency: 5,
  self_harm: 6,
};

export interface InputGuardrailOptions {
  /**
   * `true` (default) runs the Haiku classifier; a function lets callers inject
   * a classifier for tests; `false` skips it entirely.
   */
  classifier?: boolean | ((maskedText: string) => Promise<ClassificationResult>);
}

export function safetyInstructionFor(category: GuardrailCategory): string | null {
  switch (category) {
    case 'self_harm':
      return `This turn involves possible self-harm. Say clearly: "${SELF_HARM_LINE}" Do not give other advice.`;
    case 'emergency':
      return `This turn may describe a medical emergency. Say clearly: "${EMERGENCY_LINE}" Do not try to handle it yourself.`;
    case 'scam':
      return 'This turn involves a possible scam. Remind the person never to share money, card numbers, bank details, passwords, one-time codes, Social Security or Medicare numbers. Never repeat a number back to them. Suggest talking to a family member they trust.';
    case 'medical_question':
      return 'This turn asks for medical advice. Do not give advice, dosages or a diagnosis. Suggest asking their doctor or a family member.';
    case 'abuse':
      return 'This turn may involve abuse. Respond with care and do not suggest confronting anyone. If they are in immediate danger, tell them to call 911. Otherwise suggest a trusted family member or local support.';
    case 'distress':
      return 'This turn involves distress. Acknowledge their feelings warmly, do not diagnose, and gently encourage contact with someone they trust.';
    case 'none':
      return null;
  }
}

export function highestGuardrailCategory(
  categories: GuardrailCategory[],
): GuardrailCategory {
  return categories.reduce<GuardrailCategory>(
    (best, category) => (PRIORITY[category] > PRIORITY[best] ? category : best),
    'none',
  );
}

const highestCategory = highestGuardrailCategory;

/**
 * Merge deterministic pattern hits with the optional Haiku classifier.
 * Patterns always win on severity; the classifier can only raise the category.
 */
export async function runInputGuardrail(
  text: string,
  options: InputGuardrailOptions = {},
): Promise<InputGuardrailResult> {
  const patterns = checkInputPatterns(text);
  const hits: GuardrailHit[] = [...patterns.hits];

  let classification: ClassificationResult = {
    category: 'none',
    confidence: 0,
    degraded: true,
  };

  const classifier = options.classifier ?? true;
  if (classifier !== false) {
    classification =
      typeof classifier === 'function'
        ? await classifier(patterns.maskedText)
        : await classifyInput(patterns.maskedText);
  }

  if (classification.category !== 'none') {
    hits.push({
      category: classification.category,
      detail: `classifier: ${classification.category} (${classification.confidence.toFixed(2)})`,
      source: 'classifier',
      confidence: classification.confidence,
    });
  }

  const category = highestCategory([
    ...patterns.hits.map((hit) => hit.category),
    classification.category,
  ]);

  return {
    category,
    confidence: classification.confidence,
    hits,
    maskedText: patterns.maskedText,
    safetyInstruction: safetyInstructionFor(category),
  };
}
