# Supabase

Postgres for people, conversations, messages, guardrail flags and (Part 2) memory notes.

## One-time setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine for the POC).
2. Open **SQL Editor** and run [`migrations/0001_init.sql`](migrations/0001_init.sql).
3. Optionally run [`seed.sql`](seed.sql) for a demo person.
4. Put the project URL and **service role** key in the root `.env`:

   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```

The service role key bypasses RLS. It must only ever be used by `apps/api` and
`apps/agent`; never expose it through `NEXT_PUBLIC_*` or the browser.

## Rules

- RLS is enabled on every table with **no** anon/authenticated policies. The
  service role is the only writer.
- Guardrail flag `detail` strings must be masked (no card/SSN/code digits).
- Store transcripts only; audio is not recorded in Part 1.
- Migrations are append-only once applied. Add `0002_*.sql` for changes.

## Applying migrations

SQL editor is enough for Part 1. If you use the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

See [docs/architecture/data-model.md](../docs/architecture/data-model.md) for the
table rationale and retention plan.
