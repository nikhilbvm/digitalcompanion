# Changelog

## [Unreleased]

### Added

- pnpm TypeScript monorepo: `apps/web`, `apps/api`, `apps/agent`, `packages/core`.
- Text chat over SSE with masked persistence and per-sentence output filtering.
- LiveKit voice agent with Deepgram Nova-3/Aura-2, Silero VAD, turn detection, and a custom
  Anthropic Haiku 5.5 adapter (effort low, cached persona, refusal fallback).
- Persona and guardrails in `packages/core`: Luhn card, SSN, OTP, Medicare masking; scam/emergency/
  self-harm patterns; Haiku classifier; output filter; 63 tests.
- Supabase schema: people, conversations, messages, guardrail flags, memory notes; RLS enabled.
- Large-type companion screen and minimal local admin.
- Documentation system, per-subproject docs and CLAUDE files, AGENTS manual, decision log.
- CI workflow and manual GHCR container publishing; API and agent Dockerfiles.
- Part 2 roadmap (memory, scheduled ring, AWS/Terraform).

### Security

- Service role key is server-only; no anon RLS policies.
- Sensitive identifiers are masked before storage, classifier calls and flag details.
- Documented POC risks and the pre-deployment checklist.
