import type { GuardrailHit } from '../types.js';

export const REDACTED_CARD = '[redacted-card]';
export const REDACTED_SSN = '[redacted-ssn]';
export const REDACTED_CODE = '[redacted-code]';
export const REDACTED_MEDICARE = '[redacted-medicare]';

const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
const OTP_NEAR_CODE =
  /(?:\b(?:code|otp|one[- ]time(?: code)?|verification code|passcode|pin)\b[^.!?\n]{0,40}?\b\d{4,8}\b)|(?:\b\d{4,8}\b[^.!?\n]{0,40}?\b(?:code|otp|one[- ]time|verification|passcode|pin)\b)/gi;
const MEDICARE_NUMBER = /\bmedicare\b[^.\n]{0,30}?\b\d{6,12}\b/gi;

const SCAM_PHRASES =
  /\b(gift cards?|wire (?:the )?money|bitcoin|crypto(?:currency)?|grandson in jail|grandchild in jail|granddaughter in jail|irs|medicare (?:number|card|id))\b/i;

const EMERGENCY_PHRASES =
  /\b(i (?:fell|have fallen)|fell (?:and|down)|can'?t get up|cannot get up|chest pain|trouble breathing|can'?t breathe|cannot breathe|stroke|face droop|numb(?:ness)? (?:on )?one side|signs? of a stroke)\b/i;

const SELF_HARM_PHRASES =
  /\b(kill myself|suicide|suicidal|end my life|hurt myself|self[- ]harm|don'?t want to live|don'?t want to be here anymore)\b/i;

/** Luhn checksum used by payment cards. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export function findCardNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      found.push(match[0]);
    }
  }
  return found;
}

export function findSsn(text: string): string[] {
  return Array.from(text.matchAll(SSN), (m) => m[0]);
}

export function findOtp(text: string): string[] {
  return Array.from(text.matchAll(OTP_NEAR_CODE), (m) => m[0]);
}

export function findMedicareNumber(text: string): string[] {
  return Array.from(text.matchAll(MEDICARE_NUMBER), (m) => m[0]);
}

/**
 * Replace sensitive identifiers with stable redaction tokens. Call this before
 * persisting, logging, or sending text to the classifier.
 */
export function maskSensitive(text: string): string {
  let out = text;

  out = out.replace(CARD_CANDIDATE, (candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
      ? REDACTED_CARD
      : candidate;
  });

  out = out.replace(SSN, REDACTED_SSN);

  out = out.replace(MEDICARE_NUMBER, (match) => {
    const digits = match.match(/\d{6,12}/)?.[0];
    return digits ? match.replace(digits, REDACTED_MEDICARE) : match;
  });

  out = out.replace(OTP_NEAR_CODE, (match) => {
    const digits = match.match(/\d{4,8}/)?.[0];
    return digits ? match.replace(digits, REDACTED_CODE) : match;
  });

  return out;
}

export interface PatternResult {
  hits: GuardrailHit[];
  maskedText: string;
}

/**
 * Deterministic checks that must never depend on a network call. One hit per
 * category keeps the flag list readable.
 */
export function checkInputPatterns(text: string): PatternResult {
  const hits: GuardrailHit[] = [];

  const cards = findCardNumbers(text);
  const ssns = findSsn(text);
  const otps = findOtp(text);
  const medicare = findMedicareNumber(text);
  if (cards.length > 0) {
    hits.push({ category: 'scam', detail: 'payment card number detected', source: 'pattern' });
  }
  if (ssns.length > 0) {
    hits.push({ category: 'scam', detail: 'Social Security number detected', source: 'pattern' });
  }
  if (otps.length > 0) {
    hits.push({
      category: 'scam',
      detail: 'one-time/verification code detected',
      source: 'pattern',
    });
  }
  if (medicare.length > 0) {
    hits.push({ category: 'scam', detail: 'Medicare number detected', source: 'pattern' });
  }

  const scamPhrase = text.match(SCAM_PHRASES)?.[0];
  if (scamPhrase) {
    hits.push({
      category: 'scam',
      detail: `scam-related phrase: ${scamPhrase.toLowerCase()}`,
      source: 'pattern',
    });
  }

  const emergencyPhrase = text.match(EMERGENCY_PHRASES)?.[0];
  if (emergencyPhrase) {
    hits.push({
      category: 'emergency',
      detail: `emergency phrase: ${emergencyPhrase.toLowerCase()}`,
      source: 'pattern',
    });
  }

  const selfHarmPhrase = text.match(SELF_HARM_PHRASES)?.[0];
  if (selfHarmPhrase) {
    hits.push({
      category: 'self_harm',
      detail: `self-harm phrase: ${selfHarmPhrase.toLowerCase()}`,
      source: 'pattern',
    });
  }

  return { hits, maskedText: maskSensitive(text) };
}
