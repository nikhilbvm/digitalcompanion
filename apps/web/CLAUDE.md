# CLAUDE.md — apps/web

Next.js UI for the older adult and the local admin page.

## Read first

- [docs/main.md](docs/main.md)
- [docs/voice-ui.md](docs/voice-ui.md)

## Invariants

- Mobile-first one-screen companion with a right-side drawer; large text, high contrast, 44px+
  targets (call target 72px), visible focus rings.
- A 2-second “Digital Companion” splash appears on the companion page only.
- Settings persist person selection and “Show chat” in `localStorage`; chat defaults off.
- No emergency/disclaimer footer is shown in the POC UI. Safety flags remain in admin.
- Client-friendly: no server-only Next features, because this will be wrapped with Capacitor.
- Never use `DATABASE_URL`/DB credentials or import core's `db.ts`/classifier at runtime. Import
  types only from `@companion/core/types`.
- `delta` SSE text is already output-filtered; render it as-is, never raw model output.
- Voice transcript comes from `lk.transcription` text streams; register the handler before connecting.
- The admin page is unauthenticated for the POC; do not expose it.
- Person edits persist through `PUT /people/:id`.

## Commands

```bash
pnpm --filter @companion/web dev
pnpm --filter @companion/web typecheck
pnpm --filter @companion/web build
```

## Where to change what

| Change | Location |
|---|---|
| Main screen/state | `src/app/page.tsx` |
| Drawer/settings/splash/toast | `src/components/Drawer.tsx`, `SplashScreen.tsx`, `Toast.tsx` |
| Chat/transcript/auto-scroll | `src/components/ChatPane.tsx` |
| Call button/orb | `CallDock.tsx`, `CompanionOrb.tsx` |
| Voice room/transcript/speaker | `src/lib/livekit.ts` |
| Preferences | `src/lib/preferences.ts` |
| SSE parsing | `src/lib/api.ts` |
| Admin/people editing | `src/app/admin/page.tsx`, `PersonForm.tsx` |
| Type scale/colors/animations | `globals.css` + Tailwind classes |

## Cross-links

[README](README.md) · [docs](docs/main.md) · [core](../../packages/core/CLAUDE.md) ·
[api](../../apps/api/CLAUDE.md) · [agent](../../apps/agent/CLAUDE.md) · [AGENTS](../../AGENTS.md)
