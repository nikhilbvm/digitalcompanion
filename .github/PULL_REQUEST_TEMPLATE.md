## What changed

<!-- One or two sentences. Link the relevant docs/checklist item. -->

## Safety impact

- [ ] No change to persona/guardrails/masking
- [ ] Guardrail change — tests added and [guardrails doc](../docs/architecture/guardrails.md) updated
- [ ] Auth/data-access change — security review noted in the description

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build` (if config/deps changed)
- [ ] Manual check (describe what needs real credentials)

## Docs

- [ ] Subproject docs updated
- [ ] Decision log updated (if architectural)
- [ ] `.env.example` updated (if a variable changed)
