# @companion/web

Next.js App Router + Tailwind. One mobile-first companion screen (splash, animated call state,
optional chat, right-side settings drawer) and a matching `/admin` shell. Client-side only; no API
keys and no database access.

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

- `/` — 2-second splash, animated companion orb, phone call button, optional chat/live transcript,
  right-side settings drawer (person + “Show chat”).
- `/admin` — right-side section menu for People, Conversations and New person; editable person
  profiles; conversation and guardrail review. Local POC; no auth.

## Structure

```
src/app/page.tsx              companion screen (client)
src/app/admin/page.tsx        admin (client)
src/components/               SplashScreen, Drawer, Toast, CompanionOrb, ChatPane,
                              CallDock, PersonForm, Icons
src/lib/api.ts                fetch + SSE parser
src/lib/livekit.ts            VoiceSession (room, transcript, speaker state)
src/lib/preferences.ts        localStorage person/show-chat preferences
```

## Accessibility

Large text (root 18px), high contrast, 44–72px targets, visible focus rings, keyboard/Escape drawer,
reduced motion respected, `aria-live` transcript. See [docs/main.md](docs/main.md).

Docs: [docs/main.md](docs/main.md) · [docs/voice-ui.md](docs/voice-ui.md) · Agent file:
[CLAUDE.md](CLAUDE.md)
