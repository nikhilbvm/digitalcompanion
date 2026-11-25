# Web — design notes

## Why one screen

The primary user is an older adult who may be anxious about technology. The home screen has a person
picker and two enormous actions. There are no menus, settings or navigation. Admin lives at a separate
URL and is for the family.

## Screens and state

`/` (`src/app/page.tsx`, client component):

| State | UI |
|---|---|
| home | person picker + Talk now + Chat now |
| voice | `VoicePanel`: status (`requesting-mic`, `connecting`, `listening`, `speaking`, `ended`, `error`), live transcript, End |
| chat | `ChatPanel`: streamed messages, large textarea, Send, Speak instead (dictation), Read aloud, End |

Shared state: `people`, `personId`, `conversationId`, `messages`, `transcript`, `error`, `lastFlag`.
Changing the person resets the conversation.

`/admin` (`src/app/admin/page.tsx`): create person form, people list, conversations list, conversation
detail with messages and flags. No auth, clearly labeled.

## API client

`src/lib/api.ts` wraps fetch, validates errors, and parses the SSE frames from `POST /chat`. It never
uses `EventSource` (POST) and never logs message text.

`src/lib/livekit.ts`:

1. prompts for mic permission with `getUserMedia` and stops the temporary tracks,
2. fetches a token from the API,
3. registers `room.registerTextStreamHandler('lk.transcription', …)` **before** connecting,
4. maps `ActiveSpeakersChanged` → "Listening…" / "Your companion is speaking…",
5. on `Disconnected`/agent leave → ended,
6. `end()` calls the conversation end endpoint and disconnects.

Transcript segments: keyed by `lk.segment_id`; final replaces interim (`lk.transcription_final`).
User transcripts carry `lk.transcribed_track_id`; agent output does not, which determines the speaker
label.

## Accessibility contract

- Body ≥ 24px (`text-2xl` on a 18px root = 27px); buttons `text-3xl`/`text-4xl`.
- High contrast: dark slate text on warm off-white; teal/amber actions with white text.
- Minimum target 64px high; generous spacing.
- Visible focus rings (`focus-visible:ring-4`).
- `aria-live="polite"` on transcript/status/chat; `role="alert"` on errors.
- Reduced motion respected in `globals.css`.
- No color-only meaning; labels are text.
- The footer states 911/988 and the local-POC limitation.

## Deliberate limitations

- No login, no multi-family accounts; admin is open locally.
- Read-aloud uses the browser's `speechSynthesis`; voice quality varies.
- Dictation uses Web Speech API if present; hidden when unavailable.
- Transcript display depends on LiveKit text streams; older clients may not receive them.
- No session resume after refresh (POC).
- Part 2 adds authentication, Capacitor packaging and an accessibility review with older adults.
