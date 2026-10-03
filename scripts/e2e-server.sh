#!/bin/sh
# Builds and serves the production app for Playwright against its own throwaway
# PostgreSQL container, so no existing database is ever reset or touched.
set -e
docker rm -f cabas-e2e-db > /dev/null 2>&1 || true
docker run -d --rm --name cabas-e2e-db -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e -e POSTGRES_DB=cabas_e2e \
  -p 127.0.0.1:5433:5432 postgres:18-alpine > /dev/null
until docker exec cabas-e2e-db pg_isready -U e2e -d cabas_e2e > /dev/null 2>&1; do sleep 1; done
export DATABASE_URL="postgresql://e2e:e2e@127.0.0.1:5433/cabas_e2e"
export UPLOADS_DIR="$(mktemp -d)"
pnpm prisma migrate deploy
pnpm build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
PORT=3100 HOSTNAME=127.0.0.1 exec node .next/standalone/server.js
