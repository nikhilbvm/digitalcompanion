# CLAUDE.md — apps/web

Next.js UI for the older adult and the local admin page.

## Read first

- [docs/main.md](docs/main.md)
- [docs/voice-ui.md](docs/voice-ui.md)

## Invariants

- One screen, huge type (body ≥ 24px), high contrast, no menus, 64px+ targets.
- Client-friendly: no server-only Next features, because this will be wrapped with Capacitor.
- Never use `DATABASE_URL`/DB credentials or import core's `db.ts`/classifier at runtime. Import
  types only from `@companion/core/types`.
- `delta` SSE text is already output-filtered; render it as-is, never raw model output.
- Voice transcript comes from `lk.transcription` text streams; register the handler before connecting.
- The admin page is unauthenticated for the POC; keep the warning banner and do not expose it.
- Keep the 911/988 footer.

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
| Chat/dictation/read-aloud | `src/components/ChatPanel.tsx` |
| Voice room/transcript | `src/lib/livekit.ts`, `VoicePanel.tsx` |
| SSE parsing | `src/lib/api.ts` |
| Admin | `src/app/admin/page.tsx` |
| Type scale/colors | `globals.css` + Tailwind classes |

## Cross-links

[README](README.md) · [docs](docs/main.md) · [core](../../packages/core/CLAUDE.md) ·
[api](../../apps/api/CLAUDE.md) · [agent](../../apps/agent/CLAUDE.md) · [AGENTS](../../AGENTS.md)
