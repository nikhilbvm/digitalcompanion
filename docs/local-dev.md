# Local development

Part 1 runs on a laptop with managed OpenRouter, Deepgram and LiveKit Cloud accounts and a Postgres
database. OpenRouter is the default LLM gateway (Claude Haiku 5.5); direct Anthropic is optional.
Use the included Docker Postgres locally; Amazon RDS is the cloud target.

---

## 1. Prerequisites

- **Node 22 LTS** (`node --version` → v22.x). `.nvmrc` is `22`.
- **pnpm 10** via corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@10.34.9 --activate
  ```
- **Docker** (for the local Postgres service and container builds).
- A modern browser with microphone access (Chrome/Edge/Safari).

---

## 2. Create the accounts

### OpenRouter (default)

1. Create an API key at [openrouter.ai](https://openrouter.ai) (or reuse an existing OpenRouter key for local testing).
2. The app uses `anthropic/claude-haiku-5.5` for chat, voice and the safety classifier.
3. Put it in `.env` as `OPENROUTER_API_KEY` and keep `LLM_PROVIDER=openrouter`.
4. The default config pins the `anthropic` provider, disables fallbacks, and requests
   `data_collection: deny`. Change `OPENROUTER_PROVIDER`/model only deliberately.

Direct Anthropic is optional: set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` if you want to
bypass OpenRouter. Do not add both keys to the browser or any `NEXT_PUBLIC_*` variable.

### Deepgram

1. Create a project at [console.deepgram.com](https://console.deepgram.com) and an API key.
2. Used for Nova-3 STT and Aura-2 TTS.
3. Put it in `.env` as `DEEPGRAM_API_KEY`.

### LiveKit Cloud

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io) (the free Build plan is enough).
2. Copy the project **WebSocket URL** (`wss://…`), **API key** and **API secret**.
3. Put them in `.env` as `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
4. `AGENT_NAME` is `dc-local` for local development. `scripts/dev.sh` exports it so the local
   worker cannot receive dispatches intended for the deployed tenant worker (`dc`). Keep the local
   API and worker on the same name; cloud gets `dc` from its SSM-rendered `.env`.

### Postgres

Local (recommended for the POC):

```bash
pnpm db:up        # start postgres:16 from docker-compose.yml
pnpm db:migrate   # apply db/migrations/0001_init.sql
pnpm db:seed      # optional demo person
```

The defaults in `.env.example` point at
`postgres://companion:companion_dev@localhost:5432/digitalcompanion` with SSL off.

Amazon RDS (cloud): create a PostgreSQL instance in private subnets, put the connection string in
Secrets Manager, set `DATABASE_URL` and `DATABASE_SSL=true`, and run `pnpm db:migrate` from a machine
that can reach it. See [db/README.md](../db/README.md). The database credentials are server-only;
never put `DATABASE_URL` in a `NEXT_PUBLIC_*` variable.

---

## 3. Configure

```bash
cd digitalcompanion
pnpm install
cp .env.example .env
```

Fill `.env`:

| Variable | Required | Notes |
|---|---|---|
| `LLM_PROVIDER` | no | `openrouter` (default) or `anthropic` |
| `OPENROUTER_API_KEY` | yes (default) | chat, voice and classifier |
| `OPENROUTER_MODEL` | no | default `anthropic/claude-haiku-5.5` |
| `OPENROUTER_PROVIDER` | no | default `anthropic`; clear for non-Anthropic models |
| `ANTHROPIC_API_KEY` | only if direct | fallback when `LLM_PROVIDER=anthropic` |
| `DEEPGRAM_API_KEY` | voice | STT/TTS |
| `LIVEKIT_URL` | voice | `wss://…` |
| `LIVEKIT_API_KEY` | voice | |
| `LIVEKIT_API_SECRET` | voice | |
| `DATABASE_URL` | yes | local compose default or RDS connection string |
| `DATABASE_SSL` | no | `true` for RDS; `false` locally |
| `DATABASE_SSL_CA` | no | optional RDS CA bundle path |
| `NEXT_PUBLIC_API_BASE_URL` | yes | default `http://localhost:4000` |
| `NEXT_PUBLIC_LIVEKIT_URL` | voice | same as `LIVEKIT_URL` |
| `AGENT_NAME` | no | local default `dc-local`; cloud worker is `dc` |
| `API_PORT` | no | default `4000`; cloud runtimes may inject `PORT` instead |
| `CORS_ORIGIN` | no | default `http://localhost:3000` |

Optional tuning: `LLM_EFFORT`, `ANTHROPIC_MODEL`, `CHAT_HISTORY_LIMIT`, `MAX_REPLY_TOKENS`,
`VOICE_MAX_TOKENS`, `VOICE_STT_MODEL`, `VOICE_TTS_MODEL`, `OPENROUTER_BASE_URL`,
`OPENROUTER_ALLOW_FALLBACKS`, `OPENROUTER_DATA_COLLECTION`.

---

## 4. Run

```bash
pnpm db:up        # first run, or after a reboot
pnpm db:migrate   # first run
pnpm dev          # local worker is dc-local
```

Use `pnpm dev` even when the cloud tenant is running: it defaults the worker to `dc-local`, while
the deployed tenant uses `dc`. An explicitly exported `AGENT_NAME` still overrides the default.

This starts:

- **web** → <http://localhost:3000>
- **api** → <http://localhost:4000>
- **agent** → LiveKit worker; it exits early with a list of missing variables if voice is not
  configured. Web and API keep running.

If the agent exits immediately, voice chat is unavailable but text chat still works. Run the services
separately when debugging:

```bash
pnpm --filter @companion/api dev
pnpm --filter @companion/agent dev    # builds then runs the worker
pnpm --filter @companion/web dev
```

Check the API:

```bash
curl -s http://localhost:4000/health | jq
```

`configured` shows which services have credentials; it never reveals values.

---

## 5. First run

1. Open <http://localhost:3000/admin>.
2. Create a person: full name, preferred name, interests (comma separated), topics to avoid, care
   notes.
3. Open <http://localhost:3000>.
4. Open the menu → Settings, choose the person, and optionally enable **Show chat**.
5. Tap the phone button to call, or send a typed message if chat is enabled.

### Text smoke test

Send: `my bank asked for my card number 4111 1111 1111 1111`

Expect: a scam-safety reply, the card masked in the database, and an input/output flag in `/admin`.

### Voice smoke test

1. Allow the microphone.
2. The companion greets the person by preferred name.
3. Say "I fell and can't get up" → 911 guidance and an emergency flag.
4. Interrupt while it is speaking → it stops.
5. **End** → the conversation shows `ended` in admin.

### "Are you real?"

Expect exactly the honest answer: "I'm an AI companion your family set up. I'm not a person, but I
enjoy hearing your stories."

---

## 6. Tests and checks

```bash
pnpm lint
pnpm typecheck
pnpm test        # 66 guardrail/text/stream tests
pnpm build
pnpm verify      # all of the above
```

`pnpm verify` does not exercise voice, LiveKit, Deepgram or a live RDS instance; those need real
credentials and a browser. The CI database job applies the schema and exercises the store against a
throwaway Postgres.

Full local E2E: run `pnpm dev`, then `pnpm e2e` in a second terminal, and follow
[docs/testing-local.md](testing-local.md) for the browser checklist.

Optional manual LLM check (uses your OpenRouter key, one tiny call):

```bash
pnpm --filter @companion/agent smoke:llm
```

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns `configured.database:false` | Set `DATABASE_URL`, start Postgres, restart API |
| `/people` returns 503 `not_configured` | Same as above |
| `/chat` returns 503 | Missing LLM key (`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`) or database config |
| Web fetch fails / CORS | API not running, or `CORS_ORIGIN` does not match the web origin |
| Agent exits with "missing environment variables" | Fill the listed variables; voice needs LiveKit, Deepgram, DATABASE_URL and the selected LLM key |
| Agent starts but never joins the room | `AGENT_NAME` mismatch; LiveKit URL/key wrong; check worker logs and token response |
| Mic permission denied | Allow the mic in browser settings; the web app asks once before connecting |
| No audio, transcript works | Deepgram TTS key/model issue; check agent logs; try the default `aura-2-andromeda-en` |
| Transcript empty on voice | Text stream handler must be registered before connecting (it is); check LiveKit text streams and agent output sync |
| `[guardrails] classifier degraded` | LLM key missing/timeout/structured-output rejection; patterns still work; check `OPENROUTER_API_KEY` and the API logs |
| Port 3000/4000 busy | Change `API_PORT`/`next dev -p`; update `NEXT_PUBLIC_API_BASE_URL` |
| Next build fails after config changes | Run `pnpm --filter @companion/web build` and read the first error; ensure `transpilePackages` still includes `@companion/core` |

### Verify database data

```bash
docker compose exec db psql -U companion -d digitalcompanion -c \
  "select role, text, created_at from messages order by created_at desc limit 20;"
docker compose exec db psql -U companion -d digitalcompanion -c \
  "select stage, category, detail, created_at from guardrail_flags order by created_at desc limit 20;"
```

Confirm no card/SSN/OTP digits appear in `messages.text` or `guardrail_flags.detail`.

---

## 8. Security notes

- The POC has no login. Run it locally only.
- Do not commit `.env` or real personal data.
- The admin page and API are unauthenticated; do not expose them via a tunnel or public host.
- See [architecture/security-privacy.md](architecture/security-privacy.md) for the pre-deployment
  checklist.
