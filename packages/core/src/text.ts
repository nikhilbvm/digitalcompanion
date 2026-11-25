const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'no',
  'approx',
]);

function isBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (char !== '.' && char !== '!' && char !== '?') return false;

  // Ellipsis: "..." is not a sentence end until the last dot.
  if (char === '.' && text[index + 1] === '.') return false;

  const next = text[index + 1];
  if (next !== undefined && !/\s/.test(next)) {
    // Decimal numbers (3.5) and abbreviations without spaces are not boundaries.
    return false;
  }

  if (char === '.') {
    const before = text.slice(Math.max(0, index - 6), index).toLowerCase();
    const word = before.match(/([a-z.]+)$/)?.[1];
    if (word && ABBREVIATIONS.has(word)) return false;
  }

  return true;
}

/** Split a completed reply into sentences. Keeps punctuation and is lossless. */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!isBoundary(text, i)) continue;

    let end = i + 1;
    while (end < text.length && /\s/.test(text[end]!)) end++;

    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    i = end - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/**
 * Streaming sentence buffer. Push model deltas in, get complete sentences out.
 * Call flush() at the end of the stream.
 */
export class SentenceAccumulator {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];

    let boundary = -1;
    for (let i = 0; i < this.buffer.length; i++) {
      if (isBoundary(this.buffer, i)) {
        boundary = i;
        break;
      }
    }

    if (boundary === -1) return out;

    const sentence = this.buffer.slice(0, boundary + 1).trim();
    this.buffer = this.buffer.slice(boundary + 1).replace(/^\s+/, '');
    if (sentence) out.push(sentence);
    return out;
  }

  flush(): string[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    return tail ? [tail] : [];
  }

  get pending(): string {
    return this.buffer;
  }
}
