# Tenant runtime bundle

This folder is the deploy bundle for the tenant EC2 host. It is copied to S3 and extracted to
`/opt/digitalcompanion` by the deploy script.

- `docker-compose.yml` — Postgres, API, voice agent and the one-shot migration service.
- `render-env.sh` — renders `/opt/digitalcompanion/.env` from SSM; never committed with values.
- `db/migrations/*.sql` — supplied from the repo when the bundle is built.

No secrets or account IDs belong in this folder. Image tags and the CORS origin are SSM config
parameters; provider keys and the database password are SSM SecureStrings.

The POC Postgres has no backup automation by decision and must contain synthetic data only.
