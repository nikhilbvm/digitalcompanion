# Guardrails

Safety is enforced in three layers: the fixed persona, deterministic input/output checks, and a small
Haiku classifier. The deterministic layer never depends on a network call and is the floor; the
classifier can raise severity but never lowers it.

Implementation: [`packages/core/src/guardrails/`](../../packages/core/src/guardrails/). Tests:
[`packages/core/test/`](../../packages/core/test/).

---

## Threat model

| Threat | Example | Response |
|---|---|---|
| Financial scam | "My bank asked for my card number 4111 1111 1111 1111" | Scam safety instruction, mask card, flag; output filter blocks requests for identifiers |
| Credential/identifier harvesting | SSN, OTP, Medicare number, passwords | Same; masked in DB and logs; never repeated |
| Medical advice | "How much ibuprofen should I take?" | Refuse dosage/diagnosis; suggest doctor/family |
| Impersonation | "Are you a real person?" / model claims to be human | Honest AI answer; output filter blocks human/relative claims |
| Emergency | "I fell and can't get up", chest pain, stroke signs | 911 instruction this turn; emergency flag |
| Self-harm | Suicidal statements | 988 instruction this turn; self-harm flag |
| Abuse | Reports of being hurt/threatened | Careful response, no confrontation advice, 911 if immediate danger |
| Dependency | Excessive reliance on the companion | Persona encourages family/friends; never discourages outside contact |
| Prompt injection | User text instructs the classifier | Classifier treats message as data, never instructions |

---

## Input pipeline (every user turn)

1. **Deterministic patterns** — synchronous, no network:
   - Payment cards: 13–19 digit sequences validated with Luhn (spaces/hyphens allowed).
   - SSN: `123-45-6789` and space variants.
   - OTP: 4–8 digits within ~40 characters of code/OTP/one-time/verification/passcode/PIN.
   - Medicare: the word "medicare" followed by a 6–12 digit number.
   - Scam lexicon: gift card(s), wire money, bitcoin, crypto, grandson/grandchild/granddaughter in
     jail, IRS, Medicare number/card/id.
   - Emergency lexicon: I fell / have fallen / can't get up / chest pain / trouble breathing /
     can't breathe / stroke / face droop / numbness on one side.
   - Self-harm lexicon: kill myself, suicide/suicidal, end my life, hurt myself, self-harm, don't
     want to live / be here anymore.
2. **Haiku classifier** — starts in parallel with text generation (awaited in voice):
   - Model: `claude-haiku-5-5`, `effort: "low"`, structured output via `messages.parse`.
   - Schema: `{ category, confidence }` where category is one of
     `none | emergency | self_harm | scam | abuse | medical_question | distress`.
   - Input is the **masked** text; message content is wrapped in `<message>` and explicitly treated
     as data.
   - Timeout ~2.5s. On any failure it returns `none`, `degraded: true`; the reply is not blocked.
3. **Merge** — severity priority:
   `self_harm > emergency > scam > abuse > medical_question > distress > none`.
   Deterministic hits determine the floor; the classifier can only raise it.
4. **Per-turn instruction** — one line appended to the system prompt (text API) or the next LLM call
   (voice), e.g. 911/988, scam reminder, no-medical-advice.
5. **Masking** — card/SSN/OTP/Medicare numbers are replaced with `[redacted-card]`,
   `[redacted-ssn]`, `[redacted-code]`, `[redacted-medicare]` before persistence, classifier input and
   logs. In voice, the ChatMessage content is replaced with masked text so the model cannot repeat it.
6. **Flag** — one row per hit in `guardrail_flags` (`stage = input`), detail contains no raw digits.

### Late classifier (text chat)

The text API does not delay the first token for the classifier. If a later classifier result raises
severity, the API:

- appends the corresponding deterministic safety line to the reply,
- emits an extra `flag` event,
- persists the flag against the user message.

Pattern cases (card, fall) are synchronous, so the demo-critical scenarios never depend on this race.

---

## Output filter (every reply sentence)

Runs per sentence in both modes. A sentence is replaced wholesale with
`"Let's talk about something else."` if it:

- asks for money/cash/card number/bank/routing/SSN/password/one-time/verification/Medicare,
- urges sending money, wiring, buying gift cards, investing, signing, transferring, sending bitcoin
  or a crypto wallet,
- gives medication dosage/stop-start advice, or claims a diagnosis,
- claims to be human or a relative/nurse/doctor/banker,
- contains a sensitive identifier (even if accidental).

Each replacement records an `output` flag. Voice persists the **safe spoken text**, not the raw LLM
output. In text chat, only filtered text is sent to the browser and persisted.

The output filter is intentionally conservative; a false positive produces a harmless redirect. It is
not a content moderator for general conversation.

---

## Persona invariants

[`packages/core/src/persona.ts`](../../packages/core/src/persona.ts) fixes the character:
openly AI, no human name, "your companion"; short replies (1–3 sentences in voice); one question at a
time; plain words; follows the person's lead; offers light content by interest; never asks for
money/codes/identifiers; no medical/legal/financial advice; never impersonates; exact honest answer to
"are you real?"; avoids do-not-mention topics; neutral politics/religion; emergency → 911, self-harm →
988, explicitly not an emergency service; encourages family/friends and never dependence.

The persona is the **cache prefix** and must remain byte-stable. Person facts are in a separate
profile block built by `buildProfileBlock`.

---

## Persistence rules

- `messages.text` is always masked.
- `guardrail_flags.detail` is always masked and never contains raw identifiers.
- The classifier receives masked text.
- Logs contain IDs, categories, timings and counts — never message text or identifiers.
- The admin UI displays stored text and flags; it must not add client-side logging.

---

## Testing

`pnpm test` covers:

- Luhn valid/invalid cards, spaces/hyphens.
- Masking of card, SSN, OTP, Medicare; benign numbers unchanged.
- 16 pattern inputs across scam, emergency, self-harm, benign.
- Severity merge and classifier-raised categories.
- 17 blocked output sentences and 12 allowed sentences.
- Mixed replies keep safe sentences and replace only unsafe ones.
- Sentence splitting and streaming sentence accumulation.

Any new pattern or filter rule requires tests. Any change to persona safety text requires updating
this document and the acceptance matrix.

---

## Known limitations (Part 1)

- Regex/lexicon detection is English-only and can miss paraphrases; the classifier is the backstop.
- The classifier is advisory in text mode by design (parallel), so a classifier-only emergency can
  be flagged after the reply starts; the persona and synchronous patterns cover the critical cases.
- Output filtering is sentence-level and deliberately blunt.
- No audio recording and no human review workflow yet; Part 2 adds memory review and retention.
- The admin page has no auth; run locally only.
