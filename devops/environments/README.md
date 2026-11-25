# Environment contract

Part 1 runs locally from the root `.env`. Part 2 uses GitHub Environments (`dev`, `prod`) backed by AWS
Secrets Manager. This file lists **names**, never values.

## Application variables

| Variable | dev | prod | Secret? |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | yes | **yes** |
| `ANTHROPIC_MODEL` | optional | optional | no |
| `ANTHROPIC_EFFORT` | optional | optional | no |
| `DEEPGRAM_API_KEY` | yes | yes | **yes** |
| `LIVEKIT_URL` | yes | yes | no |
| `LIVEKIT_API_KEY` | yes | yes | **yes** |
| `LIVEKIT_API_SECRET` | yes | yes | **yes** |
| `AGENT_NAME` | yes | yes | no |
| `SUPABASE_URL` | yes | yes | no |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | yes | **yes** |
| `API_PORT` / `PORT` | optional | optional | no |
| `CORS_ORIGIN` | yes | yes | no |
| `CHAT_HISTORY_LIMIT` | optional | optional | no |
| `MAX_REPLY_TOKENS` | optional | optional | no |
| `VOICE_MAX_TOKENS` | optional | optional | no |
| `VOICE_STT_MODEL` | optional | optional | no |
| `VOICE_TTS_MODEL` | optional | optional | no |
| `NEXT_PUBLIC_API_BASE_URL` | yes | yes | no |
| `NEXT_PUBLIC_LIVEKIT_URL` | yes | yes | no |

## GitHub Environments (Part 2)

| Environment | Protection | Notes |
|---|---|---|
| `dev` | none | integration; separate Supabase/LiveKit projects recommended |
| `prod` | required reviewer | family use; backups and alarms mandatory |

Suggested secret names mirror the variable names so the deployment scripts can map 1:1. Do not add
`SUPABASE_SERVICE_ROLE_KEY` to any web-host environment; the web app only needs the two
`NEXT_PUBLIC_*` values.

## Rules

- Never commit an environment file with a real value.
- Rotate keys by updating the environment secret and restarting the service; never reuse a dev key in
  prod.
- `NEXT_PUBLIC_*` values are public; never put a service key behind that prefix.
- The agent needs no inbound network; the API is the only public service.
