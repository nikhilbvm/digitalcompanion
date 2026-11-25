# Part 1 checklist

Status of the local POC defined in [`initial thoughts`](../../initial%20thoughts). Verified items are
code-complete; items marked **manual** need real credentials or a browser.

## Foundation

- [x] pnpm workspace, Node 22, TypeScript everywhere
- [x] Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `verify`
- [x] `.env.example`, `.gitignore`, `.nvmrc`, corepack/pnpm pin
- [x] README, docs index, architecture docs, subproject docs, agent files
- [x] `.claude/settings.json` permission allow-list
- [x] Git history with phase commits and GitHub remote

## Database

- [x] `people`, `conversations`, `messages`, `guardrail_flags`, `memory_notes`
- [x] Indexes, checks, cascades, RLS enabled with no anon policies
- [x] Seed demo person
- [ ] **Manual:** run `0001_init.sql` against local/RDS Postgres and confirm tables

## Core

- [x] Persona with all safety rules and exact honest-AI answer
- [x] Profile block separate from the cached persona
- [x] Luhn card, SSN, OTP, Medicare detection and masking
- [x] Scam/emergency/self-harm lexicons
- [x] Haiku classifier with structured output and graceful degradation
- [x] Severity merge and per-turn safety instructions
- [x] Sentence-level output filter with safe replacement
- [x] 66 tests covering patterns, masking, output filter, sentence accumulation and the agent stream filter
- [x] Postgres pool factory and memory helpers

## API

- [x] `createApp()` separate from `listen()`
- [x] `GET /health` with configured-service flags
- [x] `GET/POST /people`
- [x] `GET /conversations`, `GET /conversations/:id`, `POST /conversations/:id/end`
- [x] `POST /livekit/token` with room dispatch and metadata
- [x] `POST /chat` SSE: meta/delta/flag/done/error
- [x] Input guardrail, parallel classifier, output filtering, masking, persistence
- [x] Refusal fallback, empty-reply fallback, partial-reply persistence
- [x] Latency log without message text
- [x] Built with tsup (core bundled)

## Voice agent

- [x] LiveKit worker with explicit dispatch (`AGENT_NAME`)
- [x] Job metadata → person/conversation; profile load
- [x] Deepgram Nova-3 STT, Aura-2 TTS, Silero VAD, turn detector
- [x] OpenRouter default adapter (direct Anthropic fallback): effort low, cached system block, refusal fallback
- [x] `onUserTurnCompleted` input guardrail and masking
- [x] `llmNode` sentence filter + safe-text persistence; `ttsNode` second layer
- [x] Recorder for user/assistant turns, flags, `ended_at`
- [x] Speech-to-first-audio latency log
- [x] Greeting by preferred name
- [ ] **Manual:** 5-minute voice call with real keys

## Web

- [x] Large-type single screen, ≥24px body, high contrast, no menus
- [x] Person picker
- [x] Talk now: mic permission, token, room, listening/speaking state, live transcript
- [x] Chat now: large textarea, streaming, dictation when available, read aloud
- [x] End button and conversation closing
- [x] `/admin`: create person, list people/conversations, view messages and flags
- [x] Local-POC/no-auth warning and 911/988 footer
- [x] Next build passes
- [ ] **Manual:** browser mic, dictation, read-aloud, screen-reader/contrast review

## DevOps

- [x] CI: install, lint, typecheck, test, build
- [x] Manual Docker publish to GHCR
- [x] API and agent Dockerfiles (pnpm deploy)
- [x] Environment contract, Terraform placeholder, Part 2 roadmap
- [x] `devops/scripts/check-env.sh`, `smoke.sh`
- [ ] **Manual:** run the Docker builds (optional)

## Acceptance

- [ ] A1 greet by name + interests (voice manual; text code-complete)
- [x] A2 card number → scam safety, masked DB, flag (code + tests; **manual** DB check)
- [x] A3 fall → 911 guidance and flag (code + tests)
- [x] A4 "are you a real person?" → honest answer (persona + tests)
- [x] A5 medical advice → refuse/suggest doctor (output filter + persona)
- [x] A6 output filter cases pass
- [ ] A7 5-minute voice call (manual)
- [x] A8 lint/typecheck/test/build pass
- [ ] A9 admin shows masked messages + flags (manual browser/DB check)

## Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

Manual checks need: OpenRouter (or direct Anthropic), Deepgram, LiveKit Cloud, a Postgres/RDS
database, and a browser with a microphone.
