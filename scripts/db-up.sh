#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop/Colima, or point DATABASE_URL at an existing Postgres/RDS instance." >&2
  exit 1
fi

docker compose up -d db

echo -n "Waiting for Postgres"
for _ in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U companion -d digitalcompanion >/dev/null 2>&1; then
    echo " ready."
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo
echo "Postgres did not become ready in time." >&2
docker compose logs db >&2 || true
exit 1
