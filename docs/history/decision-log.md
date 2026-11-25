# Decision log

Newest first. See [README](README.md) for the format.

---

## 2026-11-25 — OpenRouter as the default LLM gateway

**Decision:** Use OpenRouter (`anthropic/claude-haiku-5.5`) for text chat, the safety classifier and
the voice agent. Direct Anthropic remains available with `LLM_PROVIDER=anthropic`. Requests pin the
`anthropic` provider, disable fallbacks, set `data_collection: deny`, use `reasoning.effort: low`,
attach `cache_control` to the system prefix, and map refusal finish reasons to the gentle fallback.

**Context:** Nikhil already has an OpenRouter key from the gcsealpha2 project and wants one gateway
that can access many models. OpenRouter now supports the features this app needs for Claude:
structured outputs, reasoning effort, Anthropic prompt caching, provider pinning and
`native_finish_reason`/refusal metadata.

**Consequences:** There is an extra routing hop (latency/cost) and OpenRouter sees prompts that include
care notes; the provider is pinned and data collection denied for this app. The key is local only and
never committed; a separate OpenRouter key is still preferable for spend isolation. The direct
Anthropic adapter is retained as a fallback. Switching to a non-Anthropic model requires changing
`OPENROUTER_PROVIDER`/data policy and re-checking guardrail behavior.

---

## 2026-11-25 — AWS-only database: RDS PostgreSQL

**Decision:** Replace Supabase with Amazon RDS for PostgreSQL (Aurora Serverless v2 is the scale-up
option). The API and agent connect with a server-side `pg` pool using `DATABASE_URL`; local
development uses the Docker Postgres service.

**Context:** Supabase was used only as managed Postgres (no Auth, Storage, Realtime or Edge
Functions). Nikhil chose an AWS-only database stack. Keeping the existing SQL schema avoids a data
model rewrite; the application query layer moved from `supabase-js` to parameterized `pg` queries.

**Consequences:** `supabase/` became `db/`; `createSupabaseClient` became `createDbPool`; Store,
Recorder and memory helpers use SQL. RDS lives in private subnets with encryption, backups and TLS
(`DATABASE_SSL=true`). CI applies the migration to a throwaway Postgres and exercises the store. The
old "service-role-only Supabase" decision below is historical.

---

## 2026-11-25 — AWS-only hosting

**Decision:** Host all app compute on AWS. The web app builds to a static Next export and deploys to
S3 + CloudFront; the API and voice agent deploy to ECR + ECS Fargate (Lambda/API Gateway remains an
option for the API). AWS Amplify Hosting is a fallback if managed preview builds are wanted.
Amazon RDS for PostgreSQL is the database. OpenRouter/Anthropic, LiveKit Cloud and Deepgram remain
managed external services.

**Context:** Nikhil chose AWS-only hosting to keep infrastructure and billing in one cloud. The web
UI is client-only, so a static export is a good fit and avoids a web server. The agent is a long-lived
worker with native modules; Fargate fits better than Lambda.

**Consequences:** `NEXT_PUBLIC_*` values are set at web build time; `apps/web/out/` is synced to S3
and CloudFront is invalidated. `next start` is replaced by `serve out` for local preview. AWS deploy
work is still Part 2 (Terraform, environments, OIDC, deploy workflow); nothing deploys automatically
today. If "AWS only" is later meant to include the voice/AI providers, replacing LiveKit and the
model/speech APIs is a separate major decision.

---

## 2026-11-25 — Filter the LLM stream, not only TTS

**Decision:** The voice output filter wraps `llmNode`; `ttsNode` applies the same filter as a second
layer.

**Context:** LiveKit builds the assistant ChatMessage, the live transcription and TTS from the LLM
stream. Filtering only in `ttsNode` made the audio safe but left the raw unsafe sentence in the chat
context and the transcript the person can read.

**Consequences:** The safe text is what the context, transcript, TTS and recorder all see. Persistence
happens once in `llmNode`; `ttsNode` only records if its second layer catches something (e.g. a
future `session.say`). This is the safety invariant to preserve when adding tools or handoffs.

---

## 2026-11-25 — Custom Anthropic adapter for the voice agent (now the fallback)

**Decision:** Implement `CompanionAnthropicLLM` in `apps/agent/src/llm/anthropic.ts` instead of using
`@livekit/agents-plugin-anthropic` directly.

**Context:** The plugin accepts arbitrary model IDs but exposes no `output_config.effort`, no
prompt-cache control, and ignores `stop_reason: "refusal"`. The brief requires effort-low, a cached
persona block, and a refusal fallback.

**Consequences:** We own ~200 lines adapted from the Apache-2.0 plugin. New Anthropic features must be
added here deliberately. The adapter is tool-free in Part 1; adding tools requires mapping
`tool_use`/`tool_result` and keeping the cache breakpoint on the persona.

---

## 2026-11-25 — Deterministic guardrails before the classifier

**Decision:** Run regex/Luhn/lexicon checks synchronously and treat the Haiku classifier as a severity
raiser, never a gate.

**Context:** The demo-critical cases (card number, fall) must work even if the classifier is slow or
down. The brief requires the classifier to run in parallel with text generation to avoid latency.

**Consequences:** Text chat can emit a classifier-only safety line after the reply starts; patterns
cover the critical cases. Voice awaits the classifier because the safety instruction must be in the
prompt for the turn. Any new critical category needs a deterministic pattern too.

---

## 2026-11-25 — SSE for text chat, LiveKit for voice

**Decision:** `POST /chat` streams server-sent events over `fetch`; voice uses LiveKit Cloud rooms.

**Context:** POST keeps the message out of the URL and logs, and SSE is simpler than WebSockets for a
one-way token stream. Voice needs a real-time media transport with barge-in; LiveKit provides it plus
agent dispatch.

**Consequences:** The client has a small SSE frame parser; no `EventSource`. The API and agent share
persona/guardrails but not transport code.

---

## 2026-11-25 — Service-role-only Supabase with RLS enabled (superseded by RDS)

**Decision:** The browser never talks to Supabase. All reads/writes go through the API or agent using
the service role key; RLS is enabled on every table with no anon policies.

**Context:** The POC has no auth. Shipping an anon key would expose every person's care notes and
transcripts. The service role stays on the server.

**Consequences:** Admin/client work must add API routes, not client queries. Part 2 adds real auth and
per-person authorization before any deployment.

---

## 2026-11-25 — Raw `monorepo` with pnpm workspaces, no Turborepo

**Decision:** Four workspaces (`apps/web`, `apps/api`, `apps/agent`, `packages/core`) with pnpm
workspace scripts. No Nx/Turborepo in Part 1.

**Context:** Small project, three apps, one shared package. Build orchestration overhead is not
justified yet.

**Consequences:** Root scripts run builds sequentially. Revisit if components gain independent release
cadences or the build time grows.

---

## 2026-11-25 — Bundle `@companion/core` into API/agent builds

**Decision:** `packages/core` exports TypeScript source; tsup bundles it into the API and agent
outputs (`noExternal: ['@companion/core']`).

**Context:** The LiveKit worker forks job processes that run under plain `node`; an external workspace
import would point at a `.ts` file in `node_modules`, which Node does not execute in production.

**Consequences:** Core changes require rebuilding the API/agent images. Next transpiles the package
for the web app. If core grows native dependencies, revisit this choice.

---

## 2026-11-25 — Repository and agent conventions follow `kjsiteprovisioning2`

**Decision:** Use the same monorepo operating model: root README + docs index, per-subproject
README/docs/CLAUDE, an AGENTS operating manual, `devops/` + thin GitHub workflows, a decision log,
and a committed `.claude/settings.json` permission allow-list.

**Context:** The user already runs AI-assisted development successfully in that unrelated project; a
consistent structure lowers the cost of switching context for both the user and agents.

**Consequences:** New docs must be cross-linked from `docs/main.md`; new pipelines stay thin and put
logic in scripts; the permission allow-list is shared, while machine-local overrides stay gitignored.
