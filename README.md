# cabas

Self-hosted, mobile-first app to record grocery purchases, compare prices across stores
and plan shopping lists. Single user behind one password, served over HTTPS by Coolify. See [`docs/superpowers/specs/2026-10-03-cabas-design.md`](docs/superpowers/specs/2026-10-03-cabas-design.md).

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

## Deployment (Coolify)

1. In Coolify, create a resource from this GitHub repository (private repo: connect it with
   the Coolify GitHub App or a deploy key) and choose the **Docker Compose** build pack with
   `docker-compose.yml`.
2. Fill the environment variables Coolify detected from the Compose file. The required ones
   block the deployment until they are set:
   - `POSTGRES_PASSWORD` (required): `openssl rand -hex 24` (no URL special characters);
   - `APP_PASSWORD_HASH` (required): the line printed by `pnpm hash-password`, run on your
     computer (at least 12 characters; a long passphrase is best, the app is on the internet);
   - `SESSION_SECRET` (required): `openssl rand -base64 48`;
   - `APP_PORT` (optional, default 3000): the port the app listens on inside its container.
3. On the `app` service, set the domain with that port, e.g. `https://cabas.example.com:3000`.
   Coolify's proxy gets the HTTPS certificate and forwards to the app; no host port is
   published, so nothing else can reach the app directly.
4. In **Configuration › Advanced**, turn off **Inject Build Args to Dockerfile**: the build
   needs no variable, and this keeps the password hash and secret out of the build.
5. Deploy. Migrations run when the `app` container starts; `pgdata` and `uploads` are kept
   between deployments.

To try the production stack on your computer without Coolify (plain HTTP, localhost only):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env up -d --build
```

### Password

The app asks for one password. Generate its hash and a session secret, then put both in `.env`
before starting the stack:

```bash
pnpm hash-password            # asks the password twice (hidden), prints APP_PASSWORD_HASH=…
openssl rand -base64 48       # use as SESSION_SECRET
```

Changing the password (new hash) or `SESSION_SECRET` logs every device out. "Se déconnecter"
only removes the cookie from that device: if you think a device or cookie was compromised,
generate a new `SESSION_SECRET` and redeploy. The session cookie is
`Secure` (`COOKIE_SECURE=true` by default): it is only sent over HTTPS. After 5 wrong passwords
within 15 minutes from one address, that address waits until the end of those 15 minutes; after
50 failures from all addresses together, every new login waits too. Devices already signed in
are not affected.

Migrations run automatically when the `app` container starts. Data lives in two named
volumes: `pgdata` (database) and `uploads` (photos).
