# History

Git history records *what* changed. This folder records *why* — the decisions git messages cannot
carry well.

## What belongs here

- Architectural decisions and their consequences.
- Safety decisions (guardrail rules, classifier behavior, masking).
- Trade-offs accepted for the POC.
- Migration or deployment decisions that future agents must not silently reverse.

## What does not

- Step-by-step task logs (use the commit and the checklist).
- Secrets, names, care notes, transcripts.
- Speculation about future features (use the Part 2 roadmap).

## Files

- [decision-log.md](decision-log.md) — ADR-lite entries, newest first.
- [../planning/01-part1-checklist.md](../planning/01-part1-checklist.md) — task status.
- [../../CHANGELOG.md](../../CHANGELOG.md) — user-visible changes.

## Format

```
## YYYY-MM-DD — Short title
Decision: …
Context: …
Consequences: …
```
