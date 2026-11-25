# Data model

Schema: [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql). Seeder:
[`supabase/seed.sql`](../../supabase/seed.sql).

```
people 1 ─── n conversations 1 ─── n messages
  │                                  │
  │                                  └── n guardrail_flags (message_id nullable)
  └── n memory_notes
```

All access is through the Supabase **service role** from `apps/api` and `apps/agent`. RLS is enabled on
every table with no anon/authenticated policies, so the browser cannot read or write directly.

---

## Tables

### `people`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | not null, full name |
| `preferred_name` | text | not null, used in prompts and greeting |
| `interests` | text[] | not null default `{}` |
| `avoid_topics` | text[] | not null default `{}` |
| `care_notes` | text | nullable, sensitive |
| `created_at` | timestamptz | default now |

### `conversations`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `person_id` | uuid | FK → people, cascade delete |
| `mode` | text | `voice` or `text` |
| `started_at` | timestamptz | default now |
| `ended_at` | timestamptz | nullable; set by End/agent close |

Index: `(person_id, started_at desc)`.

### `messages`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → conversations, cascade |
| `role` | text | `user` or `assistant` |
| `text` | text | not null, **masked before insert** |
| `created_at` | timestamptz | default now |

Index: `(conversation_id, created_at)`.

### `guardrail_flags`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → conversations, cascade |
| `message_id` | uuid | FK → messages, `on delete set null` |
| `stage` | text | `input` or `output` |
| `category` | text | `none` is never stored; one of emergency/self_harm/scam/abuse/medical_question/distress |
| `detail` | text | masked human-readable description, never raw identifiers |
| `created_at` | timestamptz | default now |

Indexes: `(conversation_id, created_at desc)`, `(message_id)`.

### `memory_notes` (Part 2)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `person_id` | uuid | FK → people, cascade |
| `text` | text | not null |
| `type` | text | nullable, e.g. family/pet/preference |
| `source` | text | nullable, e.g. conversation id or `manual` |
| `sensitivity` | text | nullable; `low`/`medium`/`high` from the app |
| `created_at` | timestamptz | default now |
| `expires_at` | timestamptz | nullable |
| `active` | boolean | default true |

Index: `(person_id, active)`. Only active, non-expired, low-sensitivity notes should be injected into
prompts in Part 2; the table exists now so the schema and helpers are stable.

---

## Access rules

| Actor | people | conversations | messages | flags | memory_notes |
|---|---|---|---|---|---|
| Browser | — | — | — | — | — |
| API (service role) | read/write | read/write | read/write | read/write | read/write (helpers) |
| Agent (service role) | read | update `ended_at` | write | write | read (Part 2) |

No anon policies exist. Do not add a broad RLS policy to make a client query work; add an API route
instead.

---

## Masking and retention

- Card/SSN/OTP/Medicare numbers are masked by `packages/core` before persistence. The database should
  never contain a full card or SSN.
- Logs contain IDs, categories and timings; never message text.
- Part 1 keeps transcripts indefinitely for local review. Part 2 must add a retention policy
  (per-person retention setting, scheduled purge, export/delete on request) and a family review
  workflow.
- No audio is recorded in Part 1.

---

## Migration rules

1. Migrations are append-only once applied. Add `0002_*.sql`, never edit `0001_init.sql`.
2. Every migration must be idempotent where practical (`if not exists`, guarded `alter`).
3. Update this document and the subproject docs in the same commit.
4. Do not store secrets or real personal data in `seed.sql`.
