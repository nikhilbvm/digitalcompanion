# @companion/core

Shared contracts for Digital Companion: persona, guardrails, types, Supabase client and memory
helpers. No app or LiveKit imports.

## Surface

| Module | Exports |
|---|---|
| `persona.ts` | `COMPANION_PERSONA`, `buildProfileBlock`, `buildSystemPrompt`, `buildSystemText`, safety lines, `safetyLineFor` |
| `types.ts` | `Person`, `Conversation`, `Message`, `GuardrailFlag`, `MemoryNote`, row mappers, Zod input schemas, guardrail result shapes |
| `guardrails/` | `checkInputPatterns`, `luhnValid`, `maskSensitive`, `classifyInput`, `runInputGuardrail`, `filterOutputSentence`, `filterOutput`, `highestGuardrailCategory`, `safetyInstructionFor` |
| `supabase.ts` | `createSupabaseClient` (server-only, service role) |
| `memory.ts` | `addMemoryNote`, `listActiveMemoryNotes`, `deactivateMemoryNote`, `buildMemoryBlock` |
| `text.ts` | `splitSentences`, `SentenceAccumulator` |

The web app imports only type-only subpaths:

```ts
import type { Person } from '@companion/core/types';
```

## Commands

```bash
pnpm --filter @companion/core typecheck
pnpm --filter @companion/core test
```

## Rules

- Core must not import `apps/*` or `@livekit/agents`.
- Persona changes are safety changes: read [docs/architecture/guardrails.md](../../docs/architecture/guardrails.md),
  add tests, update the decision log if the approach changes.
- Mask identifiers before persistence and classifier calls.
- `createSupabaseClient` throws when config is missing; the API converts that to a 503.

Docs: [docs/main.md](docs/main.md) · Agent file: [CLAUDE.md](CLAUDE.md)
