# Changelog

## [Unreleased]

### Added

- pnpm TypeScript monorepo: `apps/web`, `apps/api`, `apps/agent`, `packages/core`.
- Text chat over SSE with masked persistence and per-sentence output filtering.
- LiveKit voice agent with Deepgram Nova-3/Aura-2, Silero VAD, turn detection, and custom
  OpenRouter/direct-Anthropic Haiku 5.5 adapters (effort low, cached prefix, refusal fallback).
- Persona and guardrails in `packages/core`: Luhn card, SSN, OTP, Medicare masking; scam/emergency/
  self-harm patterns; Haiku classifier; output filter; 63 tests.
- Postgres schema (local Docker or Amazon RDS): people, conversations, messages, guardrail flags,
  memory notes; RLS enabled as defense in depth.
- Large-type companion screen and minimal local admin.
- Documentation system, per-subproject docs and CLAUDE files, AGENTS manual, decision log.
- CI workflow and manual GHCR container publishing; API and agent Dockerfiles.
- Part 2 roadmap (memory, scheduled ring, AWS/Terraform).

### Changed

- OpenRouter is now the default LLM gateway for text, classifier and voice (`anthropic/claude-haiku-5.5`);
  direct Anthropic remains available with `LLM_PROVIDER=anthropic`.
- Database moved from Supabase to Amazon RDS for PostgreSQL (`pg` pool, `db/` migrations, Docker
  Postgres locally); CI applies the schema and runs a store smoke test.
- Web builds as a static Next export for AWS S3 + CloudFront (AWS-only hosting decision); local
  preview uses `serve out`.
- CI now builds both container images, smoke-tests API `/health`, and confirms the agent image reaches
  its config check.

### Security

- Service role key is server-only; no anon RLS policies.
- Sensitive identifiers are masked before storage, classifier calls and flag details.
- Documented POC risks and the pre-deployment checklist.
