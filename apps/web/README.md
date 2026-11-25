# @companion/web

Next.js App Router + Tailwind. One large-type screen for the older adult and a minimal `/admin` page.
Client-side only for product features; no API keys and no database access.

## Commands

```bash
pnpm --filter @companion/web dev        # Next dev server, http://localhost:3000
pnpm --filter @companion/web build      # static export → apps/web/out
pnpm --filter @companion/web start      # serve the static export locally
pnpm --filter @companion/web typecheck
```

The UI is client-only and builds with `output: 'export'` for AWS S3 + CloudFront. `next start` is not
used; `start` serves `out/` with `serve`.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API base (default `http://localhost:4000`) |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit WebSocket URL (also returned by the token endpoint) |

Only `NEXT_PUBLIC_*` values are exposed to the browser. Never put the service role key here.

## Screens

- `/` — person picker, **Talk now**, **Chat now**, End, live voice transcript, streamed text chat,
  dictation, read-aloud, 911/988 footer.
- `/admin` — create a person, list people/conversations, view messages and guardrail flags. Local POC;
  no auth.

## Structure

```
src/app/page.tsx              companion screen (client)
src/app/admin/page.tsx        admin (client)
src/components/               BigButton, PersonPicker, VoicePanel, ChatPanel
src/lib/api.ts                fetch + SSE parser
src/lib/livekit.ts            VoiceSession (room, transcript, state)
```

## Accessibility

Body type ≥ 24px (`text-2xl`), high contrast, 64px+ targets, visible focus rings, no menus, reduced
motion respected, `aria-live` transcript. See [docs/main.md](docs/main.md).

Docs: [docs/main.md](docs/main.md) · [docs/voice-ui.md](docs/voice-ui.md) · Agent file:
[CLAUDE.md](CLAUDE.md)
