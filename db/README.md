# Database

Postgres for people, conversations, messages, guardrail flags and (Part 2) memory notes. Runs on
local Docker Postgres or Amazon RDS/Aurora PostgreSQL — no Supabase dependency.

## Local (Docker)

```bash
pnpm db:up        # start postgres:16 from docker-compose.yml
pnpm db:migrate   # apply db/migrations/0001_init.sql
pnpm db:seed      # optional demo person
```

The compose service exposes `localhost:5432` with:

```
DATABASE_URL=postgres://companion:companion_dev@localhost:5432/digitalcompanion
DATABASE_SSL=false
```

These are the defaults in `.env.example`. `pnpm setup` runs `db:up` and `db:migrate` automatically
when Docker is available.

## Amazon RDS / Aurora

1. Create a PostgreSQL 16 RDS instance (or Aurora Serverless v2) in **private subnets**. Do not make
   it publicly accessible.
2. Put the API and agent in the same VPC; allow port 5432 from their security group only.
3. Enable encryption at rest, automated backups and deletion protection for production.
4. Store the connection string in Secrets Manager and inject it as `DATABASE_URL`:
   `postgres://<user>:<password>@<host>:5432/<db>?sslmode=require`
5. Set `DATABASE_SSL=true`. For certificate verification, mount the RDS CA bundle and set
   `DATABASE_SSL_CA=/path/to/rds-ca.pem` (recommended for production).
6. Apply the schema with a one-off task or a migration job:
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql`

The API and agent create a `pg` pool per process. The browser never connects to the database.

## Rules

- The database user is server-only. The web build must never receive `DATABASE_URL`.
- RLS is enabled with no public policies as defense in depth, but access is controlled by the VPC,
  security group and database credentials.
- Guardrail flag `detail` strings must be masked (no card/SSN/code digits) before insert.
- Store transcripts only; audio is not recorded in Part 1.
- Migrations are append-only once applied. Add `0002_*.sql` for changes.

See [docs/architecture/data-model.md](../docs/architecture/data-model.md) for the table rationale
and retention plan.
