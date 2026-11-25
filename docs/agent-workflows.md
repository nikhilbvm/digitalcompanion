# Agent workflows

How AI coding agents should work in this repository. The short version is in
[AGENTS.md](../AGENTS.md); this document is the detailed playbook.

---

## 1. Roles and boundaries

| Agent task | Owned paths | Must not touch |
|---|---|---|
| Web/UI | `apps/web/**` | server secrets, `packages/core` guardrails |
| API | `apps/api/**` | agent voice hooks |
| Voice | `apps/agent/**` | API routes |
| Shared behavior | `packages/core/**` + tests | app imports inside core |
| Schema | new `supabase/migrations/*.sql` | editing applied migrations |
| CI/DevOps | `.github/**`, `devops/**`, `docs/devops.md` | application logic |

If a change crosses boundaries, split it: core contract → app implementation → docs. Keep
`packages/core` free of app and LiveKit imports.

---

## 2. The loop

```
READ → PLAN → CHANGE → VERIFY → DOCUMENT → COMMIT → REPORT
```

### READ

1. `AGENTS.md`
2. `docs/main.md`
3. subproject `CLAUDE.md`
4. relevant architecture doc
5. existing tests for the area

Do not start editing after reading only the file the user pointed at. The contracts live in the docs.

### PLAN

For anything multi-file, write a short plan in the response (not necessarily a file):

- Goal and non-goals.
- Files to create/edit.
- Contract changes (API shape, DB column, persona/guardrail rule, env var).
- Tests to add.
- Docs to update.
- Rollback/risk.

Ask before proceeding if the plan would change a safety invariant, add auth, change the DB
destructively, or add a third-party service.

### CHANGE

- Prefer the smallest change that satisfies the contract.
- Keep shared logic in `packages/core`; keep app-specific behavior in the app.
- Do not reformat unrelated files.
- Do not add dependencies casually; justify them in the commit body.
- Never edit an applied migration; add a new one.

### VERIFY

Minimum:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Also run `pnpm build` when you change package scripts, `tsup`/Next config, dependencies, or workspace
exports. Add a targeted test for every behavior change. For guardrails, always add cases to
`packages/core/test/`.

Manual checks that need credentials (state them in the report, do not pretend they passed):

- voice call, mic permission, LiveKit dispatch, Deepgram audio
- Supabase migration/seed
- browser dictation/read-aloud

### DOCUMENT

Update in the **same commit**:

- subproject `docs/main.md` / README for behavior or contract changes,
- `docs/architecture/*` for safety/architecture changes,
- `.env.example` and `docs/local-dev.md` for new env vars,
- `docs/history/decision-log.md` for an architectural decision,
- `docs/main.md` link for any new doc.

### COMMIT

Conventional commits, one logical change:

```
feat(api): stream chat replies with sentence-level output filtering
fix(agent): keep the classifier in the voice turn path
docs(guardrails): document the OTP window
chore(ci): add image publishing workflow
```

Include the attribution footer required by the session. Never commit `.env`, `dist/`, `.next/`,
`node_modules/`, or generated audio.

### REPORT

End with:

- what changed,
- commands run and their result,
- what could not be verified without credentials,
- any follow-up the user must do (e.g. run the SQL migration, set a key).

---

## 3. Safety change protocol

Persona and guardrails are product safety code, not ordinary copy.

1. Read [architecture/guardrails.md](architecture/guardrails.md) in full.
2. Add a failing test first (pattern, output filter, or guardrail merge).
3. Make the narrowest change; never remove or weaken an existing rule to make a demo pass.
4. Re-run the full test suite.
5. Update the guardrails doc and the acceptance matrix if behavior changed.
6. In the commit body, state the threat addressed and the new tests.

If a requested change would make the companion ask for money, give medical advice, claim to be
human, or stop masking identifiers, refuse and explain why. Offer a safer alternative.

---

## 4. Database change protocol

1. New file `supabase/migrations/000N_description.sql`.
2. Use `if not exists` / guarded alters; keep it idempotent.
3. Backward-compatible for one release (add nullable columns before requiring them).
4. Update `docs/architecture/data-model.md` and the subproject docs.
5. Never put real personal data in `seed.sql`.
6. Never add a broad RLS policy to unblock a client; add an API route instead.

---

## 5. Debugging protocol

1. Reproduce with the smallest input.
2. Read the actual error, not the assumed one.
3. Check configuration first: `/health` `configured`, env names, `AGENT_NAME`, ports.
4. For voice: check worker logs, dispatch metadata, token response, mic permission, Deepgram/LiveKit
   keys.
5. For text: check SSE frames, API logs, Supabase rows, classifier degradation logs.
6. Add a regression test before fixing if the bug is in shared logic.
7. Do not log secrets or message text to diagnose.

---

## 6. Anti-patterns

- Editing `packages/core` to import `@livekit/agents` or an app.
- Using the Supabase service role key in the browser.
- Adding `temperature`, `top_p`, `top_k`, or assistant prefill to Claude requests.
- Making the persona dynamic per request (breaks the cache prefix).
- Replacing the output filter with a prompt instruction only.
- Adding a table column without a migration and docs.
- "Fixing" a failing guardrail test by weakening the guardrail.
- Committing build output or screenshots that contain PII.
- Starting Part 2 features (memory injection, AWS) inside Part 1 without a plan update.

---

## 7. History and handoff

- Architectural decisions → `docs/history/decision-log.md` (date, decision, context, consequences).
- User-visible changes → `CHANGELOG.md`.
- Task status → `docs/planning/01-part1-checklist.md`.
- End-of-session report: what was built, how to run it, what was verified, what needs real
  credentials, and what Part 2 needs next.
