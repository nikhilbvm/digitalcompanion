# Decision log

Newest first. See [README](README.md) for the format.

---

## 2026-11-25 — Hosting split: Vercel web, AWS API/agent

**Decision:** The web app deploys to Vercel by default; the API and voice agent deploy to AWS (ECR +
ECS Fargate, with Lambda/API Gateway kept open for the API). Supabase, LiveKit Cloud, Anthropic and
Deepgram remain managed services.

**Context:** Vercel gives preview deployments and zero web infrastructure work, while the agent is a
long-lived worker with native modules and the API needs a normal container. A single-cloud S3 +
CloudFront option exists if that becomes a requirement.

**Consequences:** `NEXT_PUBLIC_*` values are set in the Vercel build environment. AWS deploy work is
still Part 2 (Terraform, environments, OIDC, deploy workflow); nothing deploys automatically today.

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

## 2026-11-25 — Custom Anthropic adapter for the voice agent

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

## 2026-11-25 — Service-role-only Supabase with RLS enabled

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
