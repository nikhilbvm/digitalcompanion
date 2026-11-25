# Local development

Part 1 runs entirely on a laptop with four managed accounts: Anthropic, Deepgram, LiveKit Cloud and
Supabase. No AWS account is needed until Part 2.

---

## 1. Prerequisites

- **Node 22 LTS** (`node --version` → v22.x). `.nvmrc` is `22`.
- **pnpm 10** via corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@10.34.9 --activate
  ```
- Docker (optional; only for building the API/agent images).
- A modern browser with microphone access (Chrome/Edge/Safari).

---

## 2. Create the accounts

### Anthropic

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. The app uses `claude-haiku-5-5` for chat and the safety classifier.
3. Put it in `.env` as `ANTHROPIC_API_KEY`.

### Deepgram

1. Create a project at [console.deepgram.com](https://console.deepgram.com) and an API key.
2. Used for Nova-3 STT and Aura-2 TTS.
3. Put it in `.env` as `DEEPGRAM_API_KEY`.

### LiveKit Cloud

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io) (the free Build plan is enough).
2. Copy the project **WebSocket URL** (`wss://…`), **API key** and **API secret**.
3. Put them in `.env` as `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
4. `AGENT_NAME` defaults to `companion`. Keep it identical in the token endpoint and the worker
   (both read the same `.env` in this monorepo).

### Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open **SQL Editor** and run [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
3. Optionally run [`supabase/seed.sql`](../supabase/seed.sql) for a demo person.
4. Copy **Project URL** and the **service_role** key (Settings → API). Put them in `.env` as
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The service role key bypasses RLS. It is server-only; never put it in a `NEXT_PUBLIC_*` variable.

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
| `ANTHROPIC_API_KEY` | yes | chat + classifier |
| `DEEPGRAM_API_KEY` | voice | STT/TTS |
| `LIVEKIT_URL` | voice | `wss://…` |
| `LIVEKIT_API_KEY` | voice | |
| `LIVEKIT_API_SECRET` | voice | |
| `SUPABASE_URL` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server-only |
| `NEXT_PUBLIC_API_BASE_URL` | yes | default `http://localhost:4000` |
| `NEXT_PUBLIC_LIVEKIT_URL` | voice | same as `LIVEKIT_URL` |
| `AGENT_NAME` | no | default `companion` |
| `API_PORT` | no | default `4000` |
| `CORS_ORIGIN` | no | default `http://localhost:3000` |

Optional tuning: `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `CHAT_HISTORY_LIMIT`, `MAX_REPLY_TOKENS`,
`VOICE_MAX_TOKENS`, `VOICE_STT_MODEL`, `VOICE_TTS_MODEL`.

---

## 4. Run

```bash
pnpm dev
```

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
4. Pick the person, then **Talk now** or **Chat now**.

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

`pnpm verify` does not exercise voice, LiveKit, Deepgram or Supabase; those need real credentials and
a browser.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` returns `configured.supabase:false` | Fill `SUPABASE_URL` + service role key, restart API |
| `/people` returns 503 `not_configured` | Same as above |
| `/chat` returns 503 | Missing Anthropic or Supabase config |
| Web fetch fails / CORS | API not running, or `CORS_ORIGIN` does not match the web origin |
| Agent exits with "missing environment variables" | Fill the listed variables; voice needs LiveKit, Deepgram, Supabase and Anthropic |
| Agent starts but never joins the room | `AGENT_NAME` mismatch; LiveKit URL/key wrong; check worker logs and token response |
| Mic permission denied | Allow the mic in browser settings; the web app asks once before connecting |
| No audio, transcript works | Deepgram TTS key/model issue; check agent logs; try the default `aura-2-andromeda-en` |
| Transcript empty on voice | Text stream handler must be registered before connecting (it is); check LiveKit text streams and agent output sync |
| `[guardrails] classifier degraded` | Anthropic key missing/timeout; patterns still work; check `ANTHROPIC_API_KEY` |
| Port 3000/4000 busy | Change `API_PORT`/`next dev -p`; update `NEXT_PUBLIC_API_BASE_URL` |
| Next build fails after config changes | Run `pnpm --filter @companion/web build` and read the first error; ensure `transpilePackages` still includes `@companion/core` |

### Verify Supabase data

```sql
select role, text, created_at from messages order by created_at desc limit 20;
select stage, category, detail, created_at from guardrail_flags order by created_at desc limit 20;
```

Confirm no card/SSN/OTP digits appear in `messages.text` or `guardrail_flags.detail`.

---

## 8. Security notes

- The POC has no login. Run it locally only.
- Do not commit `.env` or real personal data.
- The admin page and API are unauthenticated; do not expose them via a tunnel or public host.
- See [architecture/security-privacy.md](architecture/security-privacy.md) for the pre-deployment
  checklist.
