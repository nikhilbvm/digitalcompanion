# AGENTS.md — operating manual for coding agents

This is the tool-agnostic entry point for any AI coding agent working in this repository. Claude Code
should also read [CLAUDE.md](CLAUDE.md); Copilot should read
[.github/copilot-instructions.md](.github/copilot-instructions.md).

Digital Companion is a safety-sensitive app for older adults. Correctness and safety outrank speed,
cleverness and demo convenience.

---

## 1. Read before you write

In this order:

1. This file.
2. [docs/main.md](docs/main.md) — the documentation index and system overview.
3. The `CLAUDE.md` of the subproject you are touching:
   [web](apps/web/CLAUDE.md) · [api](apps/api/CLAUDE.md) · [agent](apps/agent/CLAUDE.md) ·
   [core](packages/core/CLAUDE.md).
4. The relevant architecture doc:
   [system](docs/architecture/system.md) ·
   [guardrails](docs/architecture/guardrails.md) ·
   [voice pipeline](docs/architecture/voice-pipeline.md) ·
   [data model](docs/architecture/data-model.md) ·
   [security/privacy](docs/architecture/security-privacy.md).

If a change touches persona or guardrails, read
[docs/architecture/guardrails.md](docs/architecture/guardrails.md) in full before editing.

---

## 2. Repository map

```
apps/web       Next.js UI + /admin. Client-only features; no server secrets.
apps/api       Express API. App factory in src/app.ts, listen in src/index.ts.
apps/agent     LiveKit worker. OpenRouter (default) + direct Anthropic LLM adapters in src/llm/.
packages/core  Persona, guardrails, types, Postgres pool, memory helpers.
db/            SQL migrations and seed. Append-only once applied.
devops/        CI/CD strategy, env contracts, Part 2 Terraform placeholder.
docs/          Architecture, planning, local dev, agent workflows, history.
```

Dependency direction: `apps/* → packages/core`. Core must never import an app or LiveKit. The web app
must not import server-only core modules (`db.ts` and the classifier) at runtime.

---

## 3. Commands

```bash
pnpm install          # once
pnpm dev              # web + api + agent
pnpm lint
pnpm typecheck
pnpm test             # core guardrail/text tests
pnpm build            # api, agent, web
pnpm check:secrets    # tracked-file secret scan
pnpm verify           # secret scan + all of the above, in order
```

Never commit `.env`, `.env.*` (except `.env.example`), `.secrets*`, `dist/`, `.next/`, or
`node_modules/`. Never print secret values in logs, commits or chat.

---

## 4. Hard rules

1. **Never weaken a safety rule to make a demo pass.** Persona rules, guardrail patterns, output
   filtering and masking are product invariants. If a scenario is not covered, add a test and a
   narrowly scoped rule; do not remove or loosen an existing one.
2. **Sensitive identifiers never reach storage or logs.** Mask before persisting and before sending to
   the classifier; never echo a card/SSN/OTP/Medicare number back. The recorder stores the spoken
   (safe) version of voice replies, not the raw LLM output.
3. **Service role key is server-only.** It may appear in `apps/api` and `apps/agent`; never in
   `apps/web`, `NEXT_PUBLIC_*`, or client bundles. RLS is enabled with no anon policies.
4. **No sampling parameters.** LLM requests (OpenRouter `anthropic/claude-haiku-5.5` by default, or
   direct `claude-haiku-5-5` when `LLM_PROVIDER=anthropic`) use no `temperature`/`top_p`/`top_k`, no
   assistant prefill, effort low, and a cached persona/system block.
5. **Check `stop_reason`** (including `refusal`) before using a reply. Use the gentle fallback.
6. **Keep the persona cache-stable.** The `COMPANION_PERSONA` string is the cache prefix; person facts
   go in the separate profile block.
7. **Do not add server-only Next features to the UI.** The web app will be wrapped with Capacitor.
8. **API app vs listen split.** `createApp()` must stay reusable for Lambda/API Gateway.
9. **One logical change per commit**, conventional commit message, attribution footer.
10. **Update the docs in the same commit** when a contract, endpoint, table, env var or safety rule
    changes.

---

## 5. Workflow

1. **Plan.** For anything multi-file, write a short plan: files, contracts, tests, docs.
2. **Change.** Prefer small, reversible edits. Keep shared behavior in `packages/core`.
3. **Verify.** Run `pnpm lint && pnpm typecheck && pnpm test`; run `pnpm build` if a build config or
   dependency changed. Add targeted tests for behavior changes.
4. **Document.**
   - Update the subproject `docs/main.md` or README if behavior changed.
   - Add an entry to [docs/history/decision-log.md](docs/history/decision-log.md) for architectural
     decisions.
   - Update [docs/planning/01-part1-checklist.md](docs/planning/01-part1-checklist.md) if a task moved.
   - Add a link from [docs/main.md](docs/main.md) for any new document.
5. **Commit.** `type(scope): summary`; explain the why in the body; include the attribution line.
6. **Report.** State what was verified and what could not be verified without real credentials.

---

## 6. Where does this change go?

| Change | Location |
|---|---|
| Persona, safety rules, guardrail patterns, masking, shared types | `packages/core` + tests + guardrails doc |
| Text chat behavior, SSE contract, endpoint | `apps/api` + API docs + README |
| Voice turn behavior, LiveKit hooks, TTS filtering | `apps/agent` + voice docs |
| Screen, accessibility, admin | `apps/web` + web docs |
| Table/index/RLS | new `db/migrations/000N_*.sql` (never edit an applied migration) |
| Pipeline, image publishing, environments | `.github/workflows/`, `devops/`, `docs/devops.md` |
| New env var | `.env.example`, the consuming app config, `docs/local-dev.md`, deployment docs |

---

## 7. Definition of done

- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- New behavior has a test where practical; guardrail changes always do.
- Docs updated and cross-linked; decision log entry for architectural choices.
- No secrets, build output or generated files staged.
- Safety invariants unchanged unless the change is explicitly about them — and then reviewed against
  the acceptance matrix in the master plan.
- Manual-only checks (voice, LiveKit, Deepgram, live RDS) are named in the final report.

---

## 8. Manual acceptance matrix

See [docs/planning/00-master-plan.md §15](docs/planning/00-master-plan.md#15-acceptance-test-matrix).
The critical demo cases: card number → scam safety + masking + flag; fall → 911 + flag; "are you
real?" → honest AI answer; text/voice greet by preferred name and use interests.
