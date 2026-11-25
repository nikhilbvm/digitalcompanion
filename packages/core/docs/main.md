# Core — design notes

`@companion/core` is the contract layer. Both the API (text) and agent (voice) must produce the same
persona and safety outcome.

## Persona and prompt layout

```
system[0] = COMPANION_PERSONA            ← stable, cache_control ephemeral
system[1] = buildProfileBlock(person)    ← name, interests, avoid topics, care notes
system[2] = per-turn safety instruction  ← optional, added for one turn only
messages  = recent history + current user turn (masked)
```

The persona must stay byte-stable across requests. Do not interpolate the person's name, time,
request IDs or safety text into it. The profile block changes only when the person changes.

## Guardrail merge

```ts
patterns = checkInputPatterns(text)      // synchronous, deterministic
classifier = classifyInput(maskedText)   // Haiku, structured output, can degrade
category = highestGuardrailCategory([...patternCategories, classifier.category])
```

The classifier uses `messages.parse` with a Zod schema `{ category, confidence }`, `effort: "low"` and
a 2.5s timeout. Failures return `none/degraded`; they never throw into the reply path.

## Masking

Order matters: cards (Luhn-valid 13–19 digits) → SSN → Medicare → OTP. The tokens are
`[redacted-card]`, `[redacted-ssn]`, `[redacted-medicare]`, `[redacted-code]`. The same function runs
before DB inserts, classifier calls and flag details.

## Output filter

Per sentence: asks for money/identifiers, urges a money/signing action, gives dosage/diagnosis advice,
claims to be human/a relative, or contains a sensitive identifier → replace with
`"Let's talk about something else."` and record a flag.

## Types and mappers

`Person`, `Conversation`, `Message`, `GuardrailFlag`, `MemoryNote` are camelCase. `*Row` types match
Postgres columns; `map*` functions convert. Zod schemas validate API input (`newPersonSchema`,
`chatRequestSchema`, `livekitTokenRequestSchema`, `memoryNoteInputSchema`).

## Postgres / memory

`createDbPool` requires `DATABASE_URL` (local Postgres or RDS/Aurora). It uses SSL when
`DATABASE_SSL=true` and optional certificate verification via `DATABASE_SSL_CA`. Memory helpers are
Part 2-ready: only active, non-expired, low-sensitivity notes should be injected, via
`buildMemoryBlock`.

## Tests

`test/patterns.test.ts` (Luhn, masking, 16 inputs, classifier merge), `test/output-filter.test.ts`
(17 blocked, 12 allowed, mixed reply), `test/text.test.ts` (splitting/streaming). Keep them fast and
network-free.

Back to [README](../README.md) · [root docs](../../../docs/main.md)
