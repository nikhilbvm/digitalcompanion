# Web — design notes

## Product shell

The companion is a mobile-first, single-screen application:

- **Splash** — a 2-second circular “Digital Companion” splash on the companion page only.
- **Top bar** — small brand, Admin link, menu button.
- **Right drawer** — Settings for the companion; section navigation in admin.
- **Companion stage** — animated orb, call state, and optional chat/transcript.
- **Bottom call dock** — one large phone button that switches between Call and End call and disables
  itself while connecting or before a person is selected.
- **Settings** — choose who is using the companion, toggle “Show chat”, Save. Preferences persist in
  `localStorage`; chat defaults to off.
- No emergency/disclaimer footer is shown, by product request. Safety flags remain visible in admin.

## Screens and state

`/` (`src/app/page.tsx`, client component):

| State | UI |
|---|---|
| idle, chat off | large animated orb + status + call dock |
| idle, chat on | compact orb + chat messages + text input + call dock |
| connecting | compact/large orb with connecting animation; call dock disabled |
| voice | live transcript if chat is on; otherwise the orb; End call is enabled |
| chat | streamed text messages, small message composer, auto-scroll |

Shared state: `people`, `personId`, `showChat`, `conversationId`, `messages`, `transcript`,
`voiceStatus`, `speaker`, `toast`. Settings changes persist `personId`/`showChat` and reset the
current conversation.

`/admin` (`src/app/admin/page.tsx`): right-drawer menu with **People**, **Conversations** and
**New person**. People can be selected and edited (name, preferred name, interests, avoid topics,
care notes) through `PUT /people/:id`; conversations and guardrail flags remain reviewable.
No login; do not expose the admin page.

## Components

| Concern | Location |
|---|---|
| Companion screen/state | `src/app/page.tsx` |
| Settings drawer + call dock | `src/app/page.tsx`, `CallDock.tsx` |
| Chat + live transcript + auto-scroll | `ChatPane.tsx` |
| Animated orb | `CompanionOrb.tsx` |
| Menu/drawer/toast/splash | `Drawer.tsx`, `Toast.tsx`, `SplashScreen.tsx` |
| Person create/edit form | `PersonForm.tsx` |
| SSE parsing | `src/lib/api.ts` |
| LiveKit room/transcript/speaker state | `src/lib/livekit.ts` |
| Preferences | `src/lib/preferences.ts` |

## Accessibility contract

- Root font is 18px; companion bubbles are ~20px and controls are at least 44–52px high, with the
  call target at 72px.
- High contrast dark slate on warm off-white; focus rings on interactive controls.
- Drawer is a labelled modal dialog with Escape/close support; toasts use `role=alert/status`.
- Chat/transcript regions use `aria-live="polite"` and auto-scroll.
- Reduced motion is respected via `globals.css`; the splash still provides enough time for the page
  to settle.
- No color-only state: call/status labels accompany color changes.

## Hosting

The app is client-only, so `next build` exports static files to `apps/web/out/` (`output: 'export'`,
`trailingSlash: true`). The AWS target is S3 + CloudFront; CloudFront serves the bucket and TLS.
`NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_LIVEKIT_URL` are inlined at build time. `next dev` is for
local development; `pnpm build && pnpm start` previews the static output.

## Deliberate limitations

- No login, no multi-family accounts; admin is open in the POC.
- Text chat and voice share one screen but do not run simultaneously; starting a call closes an
  active text conversation.
- No session resume after a full refresh beyond saved person/chat preferences.
- Transcript display depends on LiveKit text streams.
- Part 2 adds authentication, Capacitor packaging and an accessibility review with older adults.
