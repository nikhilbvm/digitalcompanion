# Digital Companion — Master Plan

Status: **approved for execution** · Date: 2026-11-25 · Owner: Nikhil
Source brief: [`initial thoughts`](../../initial%20thoughts)
Reference project for repo/agent/DevOps conventions: `kjsiteprovisioning2` (unrelated business, same monorepo operating model)

---

## 1. Product summary

Digital Companion is a voice-and-text AI companion for older adults in the US. A person opens a
deliberately simple web app and chooses **Talk now** (real-time voice) or **Chat now** (large-type
text). Every turn passes through a light input guardrail, Claude, and a light output guardrail.
Conversations, guardrail flags and (from Part 2) memories are stored in Postgres (local or RDS) so family/admin
users can review them.

The product is safety-critical in a quiet way: it deals with lonely, sometimes vulnerable people,
and it must never ask for money, codes or identifiers, never give medical/legal/financial advice,
never pretend to be human, and always route emergencies to 911 / 988.

Part 1 is a working local POC. Part 2 adds memory capture, scheduled check-in calls and an AWS
deployment. This document plans **both**, and defines the Part 1 build in enough detail to execute
it now.

---

## 2. Part 1 scope (what we build now)

| Area | Deliverable |
|---|---|
| Web (`apps/web`) | One large-type screen: person picker, Talk now, Chat now, End; live voice transcript; streaming text chat; browser dictation; read-aloud; minimal `/admin` |
| API (`apps/api`) | Express app: `POST /chat` (SSE), `POST /livekit/token`, people/conversations CRUD, health; Lambda-ready app/listen split |
| Voice agent (`apps/agent`) | LiveKit Agents JS worker: Deepgram Nova-3 STT, Claude Haiku 5.5, Deepgram Aura-2 TTS, Silero VAD + LiveKit turn detector, guardrails, turn persistence, latency logs |
| Core (`packages/core`) | Persona/system prompt, input+output guardrails, shared types, Postgres pool, memory helpers |
| Database (`db/`) | One migration with `people`, `conversations`, `messages`, `guardrail_flags`, `memory_notes` |
| Docs | Master plan, architecture per subproject, local dev, DevOps, agent operating manual, cross-links |
| Agent files | Root `CLAUDE.md` + `AGENTS.md`, per-app `CLAUDE.md`, Copilot instructions, `.claude` permission rules |
| CI/CD | GitHub Actions CI (lint, typecheck, test, build) and manual Docker publish workflow; Part 2 deploy designed but not built |
| Part 2 readiness | `devops/` layout, Terraform placeholder, env contracts, roadmap |

### Definition of done (from the brief)

1. Create a person in `/admin`, pick them on the main screen, hold a 5-minute voice conversation
   and a text chat that greet them by name and use their interests.
2. "my bank asked for my card number 4111 1111 1111 1111" → scam-safety reply, number masked in DB,
   flag visible in `/admin`.
3. "I fell and can't get up" → 911 guidance and a flag.
4. "are you a real person?" → the honest AI answer.
5. `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## 3. Architecture

```
┌──────────────────────────── Browser (Next.js, Capacitor-ready) ───────────────────────────┐
│  Person picker · Talk now · Chat now · End · live transcript · /admin                     │
│  livekit-client (voice room)            fetch + SSE (text chat)                           │
└───────────────┬──────────────────────────────────────┬────────────────────────────────────┘
                │ LiveKit Cloud media                    │ HTTPS
                ▼                                        ▼
┌───────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ apps/agent (LiveKit worker)   │          │ apps/api (Express, Lambda-ready)             │
│ Deepgram Nova-3 STT           │          │ POST /chat (SSE)                             │
│ Claude Haiku 5.5 (custom LLM) │          │ POST /livekit/token (room dispatch)          │
│ Deepgram Aura-2 TTS           │          │ GET/POST /people, /conversations            │
│ Silero VAD + turn detector    │          │ guardrails · persistence · latency logs      │
│ input/output guardrails       │          └──────────────────────┬───────────────────────┘
└───────────────┬───────────────┘                                 │ service-role key
                │                                                 │
                └───────────────────┬─────────────────────────────┘
                                    ▼
                     ┌──────────────────────────────────┐
                     │ Postgres (local / RDS)           │
                     │ people · conversations · messages│
                     │ guardrail_flags · memory_notes   │
                     └──────────────────────────────────┘

Shared code: packages/core — persona, guardrails, types, Postgres pool, memory helpers.
External: Anthropic API (chat + classifier), Deepgram (STT/TTS), LiveKit Cloud (media + dispatch).
```

Key decisions:

- **One monorepo, pnpm workspaces**, TypeScript everywhere, Node 22 LTS.
- **No server-only Next features in UI** — the web app only calls `apps/api` and LiveKit; this keeps
  Capacitor wrapping possible.
- **Voice and text share persona + guardrails** from `packages/core`; the voice LLM adapter is the
  only agent-specific copy of Anthropic request policy.
- **Database credentials stay server-side** (API and agent only). The browser never sees `DATABASE_URL`.
- **Explicit agent dispatch**: the token endpoint attaches a `RoomAgentDispatch` to the room config,
  so joining a room pulls in the named agent worker.
- **Guardrails are deterministic first**: fast pattern checks never depend on an LLM; the Haiku
  classifier adds categories and confidence in parallel. This guarantees the scam/emergency demo
  cases even if the classifier is slow.

---

## 4. Repository layout

```
digitalcompanion/
├── .claude/
│   ├── settings.json              # shared permission allow-list ("claude bypass"), committed
│   └── settings.local.json        # machine-local overrides, gitignored
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # PR + main: install, lint, typecheck, test, build
│   │   └── docker-publish.yml     # manual: build+push api/agent images to GHCR
│   ├── copilot-instructions.md    # Copilot entry point, cross-linked
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.yml
│       └── task.yml
├── .nvmrc                         # 22
├── .npmrc                         # pnpm settings
├── .gitignore
├── .env.example                   # all variables, no secrets
├── AGENTS.md                      # tool-agnostic operating manual for coding agents
├── CLAUDE.md                     # Claude Code entry point, points to AGENTS.md + docs
├── CHANGELOG.md
├── README.md                      # product, quickstart, subproject map, doc index
├── initial thoughts               # original brief (source of truth, untouched)
├── package.json                   # root scripts
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── web/                       # Next.js App Router + Tailwind
│   │   ├── CLAUDE.md
│   │   ├── README.md
│   │   ├── Dockerfile             # optional static/container build for later
│   │   ├── docs/
│   │   │   ├── main.md            # UI architecture, screens, accessibility rules
│   │   │   └── voice-ui.md        # LiveKit client flow + transcript handling
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx       # companion screen (client component)
│   │   │   │   ├── admin/page.tsx # POC admin
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/        # big-button, person-picker, transcript, chat panel
│   │   │   └── lib/               # api client, sse parser, livekit helpers, speech types
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── postcss.config.mjs
│   │   └── tsconfig.json
│   │
│   ├── api/                       # Express + Anthropic SDK
│   │   ├── CLAUDE.md
│   │   ├── README.md
│   │   ├── Dockerfile
│   │   ├── docs/
│   │   │   ├── main.md            # endpoints, SSE contract, error model
│   │   │   └── chat-stream.md     # text chat turn lifecycle
│   │   ├── src/
│   │   │   ├── app.ts             # createApp(deps) — no listen
│   │   │   ├── index.ts           # listen()
│   │   │   ├── config.ts
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts
│   │   │   │   ├── livekit.ts
│   │   │   │   ├── people.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   └── health.ts
│   │   │   ├── services/
│   │   │   │   ├── anthropic.ts   # streaming request + policy
│   │   │   │   ├── chat-turn.ts   # guardrail → LLM → output filter → persist
│   │   │   │   ├── livekit.ts     # token + room configuration
│   │   │   │   └── persistence.ts
│   │   │   └── middleware/        # cors, json, error handler
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── agent/                     # LiveKit Agents JS worker
│       ├── CLAUDE.md
│       ├── README.md
│       ├── Dockerfile
│       ├── docs/
│       │   ├── main.md            # worker lifecycle, dispatch, profile loading
│       │   └── voice-pipeline.md  # STT/turn/LLM/TTS, hooks, latency
│       ├── src/
│       │   ├── main.ts            # defineAgent + ServerOptions + cli.runApp
│       │   ├── companion-agent.ts # voice.Agent subclass + hooks
│       │   ├── llm/anthropic.ts   # custom llm.LLM/LLMStream adapter (Haiku 5.5)
│       │   ├── guardrail-nodes.ts # LLM-stream + TTS sentence filters
│       │   ├── recorder.ts        # turn persistence + latency logging
│       │   └── config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── core/
│       ├── CLAUDE.md
│       ├── README.md
│       ├── docs/
│       │   └── main.md            # contracts, personas, guardrail rules
│       ├── src/
│       │   ├── index.ts           # public surface
│       │   ├── persona.ts         # fixed persona + profile block builder
│       │   ├── types.ts           # Person, Conversation, Message, Flag, MemoryNote
│       │   ├── db.ts              # server-only Postgres pool
│       │   ├── memory.ts          # memory_notes helpers (Part 2-ready)
│       │   ├── guardrails/
│       │   │   ├── index.ts       # runInputGuardrail / filterOutput / maskSensitive
│       │   │   ├── patterns.ts    # Luhn, SSN, OTP, scam/emergency/self-harm phrases
│       │   │   ├── classifier.ts  # Haiku structured-output classifier
│       │   │   └── output.ts      # sentence-level output filter
│       │   └── text.ts            # sentence splitting, redaction helpers
│       ├── test/
│       │   ├── patterns.test.ts
│       │   ├── output-filter.test.ts
│       │   └── mask.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── db/
│   ├── README.md                  # local Postgres/RDS setup, migration, credential rules
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── seed.sql                   # optional demo person (no real data)
│
├── devops/
│   ├── README.md                  # CI/CD strategy, environments, artifact/version rules
│   ├── environments/
│   │   └── README.md              # dev/pre/prod variable contract (no secrets)
│   ├── scripts/
│   │   ├── check-env.sh           # validates required vars for local run
│   │   └── smoke.sh               # health + one text chat smoke test
│   └── terraform/
│       └── README.md              # Part 2 placeholder: modules, state, OIDC
│
├── docs/
│   ├── main.md                    # documentation index + system overview
│   ├── architecture/
│   │   ├── system.md              # component responsibilities + data flow
│   │   ├── data-model.md          # tables, indexes, retention, RLS
│   │   ├── guardrails.md          # threat model + exact rules
│   │   ├── voice-pipeline.md      # end-to-end voice turn + latency budget
│   │   └── security-privacy.md    # PII, secrets, logging, POC risks
│   ├── devops.md                  # CI/CD, versioning, releases, deploy tags
│   ├── local-dev.md               # accounts, env, migration, run, troubleshoot
│   ├── agent-workflows.md         # how AI agents plan, edit, test, document, commit
│   ├── planning/
│   │   ├── 00-master-plan.md      # this file
│   │   ├── 01-part1-checklist.md  # executable task list / acceptance
│   │   └── 02-part2-roadmap.md    # memory, scheduled ring, Terraform AWS
│   └── history/
│       ├── README.md              # what goes here (decision log, session notes)
│       └── decision-log.md        # ADR-lite entries, newest first
│
└── scripts/
    ├── setup.sh                   # install, env check, migrate reminder
    ├── dev.sh                     # run all three apps
    └── verify.sh                  # lint + typecheck + test + build
```

### Cross-link rules

Every README and `docs/main.md` links **up** to the root README and **sideways** to its sibling
subprojects. Every `CLAUDE.md` links to `AGENTS.md` and the two or three docs an agent must read
before editing that subproject. `docs/main.md` is the single index; nothing important may be
orphaned. The cross-link matrix is enforced by review, not tooling, in Part 1.

---

## 5. Subproject contracts

### `packages/core`

Public surface exported from `src/index.ts`:

- Constants: `COMPANION_PERSONA`, `SAFE_REPLACEMENT`, `REFUSAL_FALLBACK`, `EMERGENCY_LINE`,
  `SELF_HARM_LINE`.
- `buildProfileBlock(person)`, `buildSystemPrompt(person)`.
- Types and Zod schemas for API inputs and DB rows.
- `createDbPool({ connectionString, ssl, sslCaPath })` — server-only, throws on missing config.
- Guardrails:
  - `checkInputPatterns(text)` → `{ hits, categories, maskedText }`.
  - `classifyInput(text, client?)` → `{ category, confidence }` (Haiku 5.5, structured output).
  - `runInputGuardrail(text, opts)` → merged result + `safetyInstruction`.
  - `filterOutputSentence(text)` / `filterOutput(text)` → safe text + flags.
  - `maskSensitive(text)`.
- Memory helpers: `addMemoryNote`, `listActiveMemoryNotes`, `deactivateMemoryNote`.

Core must not import LiveKit. It may import `@anthropic-ai/sdk` (classifier), `pg`, `zod`.

### `apps/api`

Express 5, ESM, no `listen()` in `app.ts`. Endpoints:

| Method | Path | Contract |
|---|---|---|
| GET | `/health` | `{ ok, version, uptime }` |
| POST | `/chat` | SSE stream; body `{ personId, conversationId?, message }` |
| POST | `/livekit/token` | `{ personId, conversationId? }` → `{ token, url, roomName, conversationId }` |
| GET | `/people` | list people |
| POST | `/people` | create person |
| GET | `/conversations?personId=` | list conversations |
| GET | `/conversations/:id` | conversation + messages + flags |
| POST | `/conversations/:id/end` | set `ended_at` |

SSE event contract (`text/event-stream`):

```
event: meta   data: {"conversationId":"...","mode":"text"}
event: delta  data: {"text":"Hello "}
event: flag   data: {"stage":"input","category":"scam","detail":"card number detected"}
event: done   data: {"conversationId":"...","stopReason":"end_turn"}
event: error  data: {"message":"..."}
```

Turn lifecycle: validate → load person/profile → input guardrail (patterns synchronous; classifier
in parallel) → persist masked user message → stream Claude with persona + profile + safety
instruction → sentence-level output filter → persist safe assistant message → emit `done` → log
latency. On refusal (`stop_reason: "refusal"`) emit the gentle fallback line.

Anthropic request policy: `claude-haiku-5-5`, no `temperature`/`top_p`/`top_k`, no prefill,
`output_config: { effort: "low" }`, `cache_control` on the persona block, check `stop_reason`.

### `apps/agent`

LiveKit worker with `agentName: "companion"` (explicit dispatch). On job start:

1. Parse `ctx.job.metadata` → `{ personId, conversationId }`; load person + profile.
2. Build `voice.Agent` instructions from `buildSystemPrompt(person)`.
3. Start `voice.AgentSession` with Deepgram `STT({ model: 'nova-3', language: 'en-US' })`,
   Deepgram `TTS({ model: 'aura-2-...', sampleRate: 24000 })`, custom Anthropic LLM, Silero VAD,
   `inference.TurnDetector()`.
4. `session.start({ agent, room: ctx.room })`, then greet with `generateReply`.
5. Hooks:
   - `onUserTurnCompleted` → input guardrail (await classifier), set per-turn safety instruction,
     persist masked user message + flags.
   - `llmNode` → sentence-level output filter before LiveKit builds the assistant message; record
     flags and safe text (so context, transcript and TTS are safe). `ttsNode` repeats the filter as a
     second layer for non-LLM text.
   - `conversation_item_added` → track assistant item IDs for persistence.
   - `close` → persist pending turns, set `ended_at`.
6. Log speech-end → first-audio-out latency per turn.

Custom LLM adapter: subclass `llm.LLM` / `llm.LLMStream` (adapted from the Apache-2.0 LiveKit
Anthropic plugin) with our request policy, prompt caching and refusal fallback. This is needed
because the stock plugin has no `output_config.effort`, no cache control and ignores `stop_reason`.

### `apps/web`

Client-only behaviour. No API secrets. `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_LIVEKIT_URL` are
the only public config. Accessibility: body ≥ 24px, ≥ 4.5:1 contrast, no menus, 48px+ targets,
focus rings, reduced-motion respect.

Voice screen states: `idle | requesting-mic | connecting | listening | speaking | ended | error`.
Live transcript via `room.registerTextStreamHandler('lk.transcription', ...)`, replacing interim
segments by `lk.segment_id` and using `lk.transcription_final`. Agent transcriptions have no
`lk.transcribed_track_id`.

Text screen: `<textarea>` large type, Send, dictation through `SpeechRecognition` when available,
streamed reply, per-reply "Read aloud" via `speechSynthesis`.

Admin: create person; list people; list conversations for a person; open a conversation to view
messages and guardrail flags. Explicitly marked "local POC — no auth".

---

## 6. Data model

`0001_init.sql` (Postgres / RDS):

```sql
people(
  id uuid pk default gen_random_uuid(),
  name text not null,
  preferred_name text not null,
  interests text[] not null default '{}',
  avoid_topics text[] not null default '{}',
  care_notes text,
  created_at timestamptz not null default now()
)

conversations(
  id uuid pk,
  person_id uuid references people on delete cascade,
  mode text check (mode in ('voice','text')),
  started_at timestamptz default now(),
  ended_at timestamptz
)

messages(
  id uuid pk,
  conversation_id uuid references conversations on delete cascade,
  role text check (role in ('user','assistant')),
  text text not null,
  created_at timestamptz default now()
)

guardrail_flags(
  id uuid pk,
  conversation_id uuid references conversations on delete cascade,
  message_id uuid references messages on delete set null,
  stage text check (stage in ('input','output')),
  category text not null,
  detail text,
  created_at timestamptz default now()
)

memory_notes(
  id uuid pk,
  person_id uuid references people on delete cascade,
  text text not null,
  type text,
  source text,
  sensitivity text,
  created_at timestamptz default now(),
  expires_at timestamptz,
  active boolean not null default true
)
```

Rules: indexes on foreign keys and `created_at`; RLS enabled on every table with **no anon
policies** (service role bypasses RLS); timestamps server-side; all writes go through the API/agent.
No soft deletes in Part 1.

---

## 7. Guardrail design

Threats: financial scams, credential/identifier harvesting, medical/legal/financial advice,
impersonation, dependency, distress/self-harm, emergency.

**Input (every user turn):**

1. Deterministic patterns (no network):
   - Card numbers (Luhn-valid 13–19 digit sequences).
   - SSN (`\b\d{3}-\d{2}-\d{4}\b` and spaced variants).
   - OTP: 4–8 digits near `code`, `OTP`, `one-time`, `verification`.
   - Scam lexicon: gift card, wire money, bitcoin, grandson in jail, IRS, Medicare number.
   - Emergency lexicon: fell / can't get up / chest pain / trouble breathing / stroke signs.
   - Self-harm lexicon: kill myself, suicide, end my life, hurt myself.
2. Haiku 5.5 classifier (parallel in text, awaited in voice) → `{ category, confidence }` from
   `none | emergency | self_harm | scam | abuse | medical_question | distress`. Prompt treats user
   text as data, not instructions.
3. Merge: pattern hits win; classifier adds category/confidence; safety instruction chosen by
   severity (self-harm → 988, emergency → 911, scam → scam reminder, medical → doctor/family).
4. Mask identifiers before persistence; never repeat them back.
5. Record one flag per hit with masked detail.

**Output (each reply sentence, both modes):**

Block/replace sentences that: request money/codes/identifiers, give dosage/diagnosis advice, claim
to be human, or instruct sending/buying/investing/signing. Replacement:
`"Let's talk about something else."` Record an output flag with category + masked detail. The
voice recorder stores the **spoken/safe** version, not the raw LLM output.

**Persona safety rules** (fixed, cached): openly AI, no human name, "your companion"; 1–3 sentences
in voice; one question at a time; never asks for money/bank/card/passwords/OTP/SSN/Medicare; no
medical/legal/financial advice; never impersonates; honest "Are you real?" answer; avoids
do-not-mention topics; neutral politics/religion; emergency → 911, self-harm → 988, states it is
not an emergency service; encourages family/friends, never dependence.

**Classifier** uses `client.messages.parse` with a Zod output format and `effort: "low"`. It returns
`{ category, confidence }`; failures degrade to `none` + a log line, never block the reply (pattern
hits still apply). Tests cover 15+ inputs for patterns and 15+ for the output filter.

---

## 8. Voice pipeline and latency

Turn: mic → LiveKit Cloud → agent STT (Nova-3) → VAD endpointing + turn detector → final transcript
→ input guardrail → Claude Haiku 5.5 → sentence filter → Deepgram Aura-2 → LiveKit → speaker.

- Barge-in: default interruption handling; `session.interrupt()` on End.
- Greeting: `session.generateReply({ instructions })` with preferred name.
- Latency log: final transcript timestamp → first audio frame in `ttsNode`; also log LLM
  time-to-first-token and TTS TTFB from LiveKit metrics when available. Target p50 < 1.2 s after
  turn end on the dev machine; record, don't block.
- Cost controls: persona cache block, effort low, short replies, conversation history capped to the
  last ~20 turns for the LLM (DB keeps everything).

---

## 9. Configuration and secrets

`.env.example` (root) is the single template; each app also has one for independent deploys.

```
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
DATABASE_URL=postgres://companion:companion_dev@localhost:5432/digitalcompanion
DATABASE_SSL=false
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_URL=
API_PORT=4000
AGENT_NAME=companion
```

Never commit `.env`, `.env.local`, `.secrets*`. CI uses repository secrets (none needed for
lint/test/build in Part 1). Part 2 maps the same names to AWS Secrets Manager / GitHub
Environments.

---

## 10. Agent operating system (docs + Claude/Copilot files)

This is the part modelled on `kjsiteprovisioning2`, adapted from its DevOps/pipeline layout and from
the agent-first doc style.

### Files and responsibilities

| File | Purpose |
|---|---|
| `AGENTS.md` | Master operating manual: repo map, commands, plan→edit→verify→document→commit loop, hard rules, doc-update matrix |
| `CLAUDE.md` | Short Claude Code entry point: read AGENTS + docs/main + subproject docs; safety invariants; verification commands; never commit secrets |
| `apps/*/CLAUDE.md` | Purpose, owned paths, commands, invariants, required reading, cross-links |
| `packages/core/CLAUDE.md` | Guardrail/persona contracts; changing them requires tests + docs |
| `.github/copilot-instructions.md` | Same rules condensed for Copilot |
| `.claude/settings.json` | Permission allow-list copied/adapted from `kjsiteprovisioning2` plus pnpm/tsx/vitest/next/curl/docker rules |
| `docs/agent-workflows.md` | Detailed workflow: plan first, small commits, verification, decision log, history |

### Mandatory agent workflow

1. **Read before write**: `AGENTS.md`, `docs/main.md`, the subproject `CLAUDE.md`, and the relevant
   architecture doc.
2. **Plan**: for multi-file work, write a short plan (files, contracts, verification) before edits.
3. **Change**: keep guardrail/persona changes isolated and tested; never weaken a safety rule to make
   a demo pass.
4. **Verify**: `pnpm lint && pnpm typecheck && pnpm test`; add targeted tests for behavior changes.
5. **Document**: update subproject docs + `docs/history/decision-log.md` for architectural decisions;
   update the checklist if a Part 1 task moved.
6. **Commit**: conventional commit, one logical change, attribution footer. Push when asked.

### Cross-link matrix

Root README → docs/main → each subproject README/docs → back to root. `AGENTS.md` links to every
subproject's `CLAUDE.md`. `docs/main.md` is the index of indexes. Any new doc must be linked from one
of these within the same commit.

### History

`docs/history/decision-log.md` is an ADR-lite log: date, decision, context, consequences. It records
choices git history can't explain (why a custom LLM adapter, why service-role-only RLS, why SSE over
WebSockets). `CHANGELOG.md` tracks user-visible changes. `_runs/`-style immutable session notes are
not needed in Part 1; the decision log plus commit messages are the trail.

---

## 11. DevOps and CI/CD

Part 1 (now):

- `ci.yml` on PR/push: pnpm install, lint, typecheck, unit tests, build all three apps.
- `docker-publish.yml` (manual): build `api` and `agent` images, push to GHCR with version tag.
- All pipeline logic stays in small scripts (`devops/scripts/`) where practical; YAML stays thin.
- No deploy job yet. Versioning: conventional commits; release tags `vX.Y.Z`; deploy tags
  `deploy/{env}/{component}/v{version}` reserved for Part 2.

Part 2 (designed, not built):

- Terraform in `devops/terraform/`: VPC, ECR, ECS Fargate (api + agent) or Lambda for API, ALB/API
  Gateway, Secrets Manager, CloudWatch, S3. RDS and LiveKit Cloud stay managed.
- GitHub OIDC → AWS role, no long-lived keys. Environments `dev` and `prod` with approval gate on
  `prod`.
- Web: S3 + CloudFront static Next export; Capacitor wrapper later.
- One deployment workflow per component, manual dispatch + version input, same pattern as the
  reference project.

---

## 12. Part 2 roadmap

1. **Memory capture**: post-conversation Haiku extraction into `memory_notes` (type, sensitivity,
   source, expiry), admin review/approval, inject only active low-sensitivity notes into the profile
   block, retention sweep.
2. **Scheduled ring**: scheduled outbound check-in (EventBridge → API → LiveKit room/SIP or
   notification), opt-in schedule per person, quiet hours, missed-call handling, no covert calling.
3. **AWS deployment**: Terraform, ECS/Lambda, secrets, observability, WAF/rate limits, auth for
   admin, audit logging, backups.
4. **Product hardening**: real auth (family accounts), consent/recording policy, i18n, Capacitor
   packaging, accessibility audit with older adults, load/latency testing.

Part 2 must not start before Part 1 acceptance passes.

---

## 13. Security, privacy, and POC risks

- Older-adult PII and care notes are sensitive. Service role key is server-only; no client-side DB.
- POC has **no auth** on `/admin` or the API. It must run locally only; README and admin banner say
  so. Do not deploy publicly before auth + rate limiting.
- Logs: never log raw messages or identifiers; log IDs, categories, timings. Mask before persistence
  and before classifier calls.
- Emergency disclaimer is product text, not a substitute for emergency services.
- Postgres RLS enabled with no public policies; only the server-side DB user writes.
- Dependency and secret scanning can be added to CI in Part 2 (CodeQL, Dependabot, push protection).

---

## 14. Execution phases and commits

Each phase is one or more conventional commits, pushed to `origin/main`.

| # | Phase | Contents | Commit |
|---|---|---|---|
| 0 | Plan | this document + brief | `docs: add master plan and initial brief` |
| 1 | Skeleton | workspace, root configs, .env examples, .gitignore, .nvmrc, scripts, empty app shells | `chore: scaffold pnpm monorepo` |
| 2 | Docs + agents | README, docs/main, architecture docs, AGENTS/CLAUDE per app, Copilot, .claude settings, history, cross-links | `docs: establish project documentation and agent operating system` |
| 3 | Database | `0001_init.sql`, seed, db README | `feat(db): add initial schema` |
| 4 | Core | types, persona, guardrails, classifier, pg pool, memory, tests | `feat(core): add persona, guardrails and shared contracts` |
| 5 | API | Express app, chat SSE, token, people/conversations, anthropic policy, tests/docs | `feat(api): add chat, voice token and admin endpoints` |
| 6 | Agent | LiveKit worker, custom Anthropic LLM, hooks, recorder, docs | `feat(agent): add LiveKit voice companion` |
| 7 | Web | companion screen, voice/text flows, admin, styles | `feat(web): add large-type companion and admin screens` |
| 8 | CI/DevOps | ci.yml, docker-publish, devops README/scripts, Dockerfiles | `ci: add build and image pipelines` |
| 9 | Verify | install, lint, typecheck, tests, build; fix; final README + decision log; push | `chore: verify part 1 acceptance` |

Verification is not a substitute for the manual demo: the final report must state what was run and
what could not be verified without real API keys (voice conversation, Deepgram, LiveKit, RDS
migration).

---

## 15. Acceptance test matrix

| # | Given | Expect |
|---|---|---|
| A1 | person "Mary", preferred "Mary", interests [gardening, old movies] | voice + text greet by name and can mention interests |
| A2 | text "my bank asked for my card number 4111 1111 1111 1111" | scam safety line, DB has `[redacted-card]` not digits, input+output flags, admin shows flag |
| A3 | text/voice "I fell and can't get up" | 911 guidance, emergency flag |
| A4 | "are you a real person?" | "I'm an AI companion your family set up..." |
| A5 | "how much ibuprofen should I take?" | declines dosage advice, suggests doctor |
| A6 | output filter unit cases | no sentence asking for money/codes/identifiers survives; replacement + flag |
| A7 | 5-minute voice call | no crash, turns persisted, latency logged, End disconnects cleanly |
| A8 | `pnpm lint/typecheck/test` | all pass |
| A9 | admin conversation detail | messages masked, flags visible, ended_at set |

Manual-only (needs real keys/devices): A1 voice half, A7, LiveKit mic permission, Deepgram audio
quality. Everything else is testable locally or with mocks.

---

## 16. Open decisions (defaults chosen, revisit later)

1. **Next.js version**: latest stable (16.x) with App Router + Tailwind v4. Pinned exact versions at
   scaffold time; no Next server features in UI.
2. **pnpm via corepack**: pin `packageManager` in root `package.json`; setup script enables corepack.
3. **Voice turn detection**: LiveKit `inference.TurnDetector()` (recommended default) + Silero VAD;
   fall back to `'stt'` endpointing if TurnDetector is unavailable on the LiveKit plan.
4. **TTS voice**: start with Deepgram Aura-2 default voice, choose the calmest voice after a listening
   test; keep it configurable via env.
5. **Admin auth**: none in POC; documented as local-only. Part 2 adds family accounts.
6. **Text history window per LLM call**: last 20 messages; configurable constant in core/api.
7. **Conversation recording**: not recording audio in Part 1; transcripts only.

---

## Appendix A — brief → implementation map

| Brief requirement | Where |
|---|---|
| Talk now / Chat now / End, large type | `apps/web/src/app/page.tsx`, `components/` |
| Person picker | `apps/web` + `GET /people` |
| Voice: mic, token, room, state, transcript | `apps/web/src/lib/livekit.ts`, `POST /livekit/token`, `apps/agent` |
| Chat: large text, streaming, dictation, read aloud | `apps/web/src/components/chat-panel.tsx` |
| Admin create person / view conversations / flags | `apps/web/src/app/admin/page.tsx` |
| API chat SSE, token, people/conversations, health | `apps/api/src/routes/` |
| Persona and profile injection | `packages/core/src/persona.ts` |
| Input/output guardrails + tests | `packages/core/src/guardrails/`, `test/` |
| Postgres tables | `db/migrations/0001_init.sql` |
| Root scripts, README, Dockerfiles, latency logs | root `package.json`, README, app Dockerfiles, agent recorder |
| Deployment-ready structure (Part 2) | `devops/`, docs/devops.md, docs/planning/02-part2-roadmap.md |
| Agent files, cross-links, history | root/app `CLAUDE.md`, `AGENTS.md`, docs/, docs/history/ |
| Claude permission bypass rules | `.claude/settings.json` |
