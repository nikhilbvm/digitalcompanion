import { SAFE_REPLACEMENT } from '../persona.js';
import type { GuardrailHit, OutputGuardrailResult } from '../types.js';
import { maskSensitive } from './patterns.js';
import { splitSentences } from '../text.js';

const ASKS_FOR_MONEY_OR_IDENTIFIERS =
  /\b(?:what(?:'s| is)|tell me|give me|share|provide|send)\b[^.!?]{0,50}\b(?:your )?(?:money|cash|card number|bank account|routing number|social security|ssn|password|one[- ]time code|verification code|medicare number)\b/i;

const URGES_MONEY_ACTION =
  /\b(?:send money|wire (?:the )?money|buy (?:a )?gift card|invest (?:in|your)|sign (?:this|the) (?:contract|form)|transfer (?:the )?money|send (?:the )?bitcoin|crypto wallet)\b/i;

const MEDICATION_ADVICE =
  /\b(?:take|increase|decrease|stop taking)\b[^.!?]{0,40}\b(?:mg|milligrams|pills?|medication|ibuprofen|tylenol|aspirin|insulin|dose|dosage)\b/i;

const DIAGNOSIS_CLAIM =
  /\b(?:you (?:probably )?have|this is|sounds like)\b[^.!?]{0,40}\b(?:cancer|diabetes|dementia|infection|stroke|heart attack|pneumonia)\b/i;

const CLAIMS_TO_BE_HUMAN =
  /\b(?:i am|i'm) (?:a |an )?(?:real |actual )?(?:human|person|your (?:daughter|son|grandson|granddaughter|nurse|doctor|banker))\b/i;

const EXPLICIT_DIAGNOSIS = /\bdiagnos(?:e|is|ed)\b/i;

function findHits(sentence: string): GuardrailHit[] {
  const hits: GuardrailHit[] = [];

  if (ASKS_FOR_MONEY_OR_IDENTIFIERS.test(sentence)) {
    hits.push({
      category: 'scam',
      detail: 'reply asked for money or a sensitive identifier',
      source: 'output',
    });
  }
  if (URGES_MONEY_ACTION.test(sentence)) {
    hits.push({
      category: 'scam',
      detail: 'reply urged a money/transfer/signing action',
      source: 'output',
    });
  }
  if (MEDICATION_ADVICE.test(sentence) || EXPLICIT_DIAGNOSIS.test(sentence)) {
    hits.push({
      category: 'medical_question',
      detail: 'reply gave dosage or diagnosis advice',
      source: 'output',
    });
  }
  if (DIAGNOSIS_CLAIM.test(sentence)) {
    hits.push({
      category: 'medical_question',
      detail: 'reply claimed a diagnosis',
      source: 'output',
    });
  }
  if (CLAIMS_TO_BE_HUMAN.test(sentence)) {
    hits.push({
      category: 'abuse',
      detail: 'reply claimed to be human or a relative',
      source: 'output',
    });
  }

  return hits;
}

/**
 * Filter one reply sentence. Unsafe sentences are replaced wholesale; a
 * sentence that merely contains a sensitive identifier is also replaced so the
 * number is never repeated to the person or stored.
 */
export function filterOutputSentence(sentence: string): OutputGuardrailResult {
  const hits = findHits(sentence);
  const masked = maskSensitive(sentence);

  if (masked !== sentence) {
    hits.push({
      category: 'scam',
      detail: 'reply contained a sensitive identifier',
      source: 'output',
    });
  }

  if (hits.length > 0) {
    return { text: SAFE_REPLACEMENT, flags: hits };
  }

  return { text: sentence, flags: [] };
}

/** Filter a completed reply (used in tests and non-streaming paths). */
export function filterOutput(text: string): OutputGuardrailResult {
  const flags: GuardrailHit[] = [];
  const safe = splitSentences(text)
    .map((sentence) => {
      const result = filterOutputSentence(sentence);
      flags.push(...result.flags);
      return result.text;
    })
    .join(' ');

  return { text: safe, flags };
}
