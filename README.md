# cabas

Self-hosted, mobile-first app to record grocery purchases, compare prices across stores
and plan shopping lists. Single user, meant to be reached through a private network
(NetBird). See [`docs/superpowers/specs/2026-10-03-cabas-design.md`](docs/superpowers/specs/2026-10-03-cabas-design.md).

## Development

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml --env-file .env up -d   # PostgreSQL on localhost:5432
pnpm install
pnpm prisma migrate dev
pnpm dev
```

Checks: `pnpm lint && pnpm typecheck && pnpm test` (integration tests start their own
PostgreSQL container, so Docker must be running). End-to-end: `pnpm test:e2e` (builds the
app and starts a throwaway PostgreSQL container on port 5433).

## Deployment (homelab)

```bash
cp .env.example .env    # set POSTGRES_PASSWORD, APP_PORT, APP_BIND and the password (below)
docker compose --env-file .env up -d --build
```

Set `APP_BIND` to the host's NetBird IP (`netbird status` shows it, `100.x.y.z`) so the app is
reachable only through NetBird and not from the rest of the home network. Docker port bindings
bypass ufw/firewalld, so `0.0.0.0` would expose the app (and its plain-HTTP cookie) to every
device on the LAN. The NetBird interface must be up before the stack starts.

### Password

The app asks for one password. Generate its hash and a session secret, then put both in `.env`
before starting the stack:

```bash
pnpm hash-password            # asks the password twice (hidden), prints APP_PASSWORD_HASH=…
openssl rand -base64 48       # use as SESSION_SECRET
```

Changing the password (new hash) or `SESSION_SECRET` logs every device out. "Se déconnecter"
only removes the cookie from that device: if you think a device or cookie was compromised,
generate a new `SESSION_SECRET` and restart the stack. Keep
`COOKIE_SECURE=false` while the app is served over plain HTTP through NetBird; set it to `true`
behind an HTTPS reverse proxy. After 5 wrong passwords within 15 minutes, login is paused for the
rest of those 15 minutes (devices already signed in are not affected).

Migrations run automatically when the `app` container starts. Data lives in two named
volumes: `pgdata` (database) and `uploads` (photos).
