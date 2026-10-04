# cabas

Self-hosted, mobile-first app to record grocery purchases, compare prices across stores
and plan shopping lists. Single user behind one password, served over HTTPS through Nginx Proxy
Manager. See [`docs/superpowers/specs/2026-10-03-cabas-design.md`](docs/superpowers/specs/2026-10-03-cabas-design.md).

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

## Deployment (Coolify + Nginx Proxy Manager)

HTTPS is handled by Nginx Proxy Manager (NPM); Coolify only builds and runs the stack.

1. In Coolify, create a resource from this GitHub repository (private repo: connect it with
   the Coolify GitHub App or a deploy key) and choose the **Docker Compose** build pack with
   `docker-compose.yml`. Do **not** set a domain on the services (Coolify's own proxy is unused).
2. Fill the environment variables Coolify detected from the Compose file. The required ones
   block the deployment until they are set:
   - `POSTGRES_PASSWORD` (required): `openssl rand -hex 24` (no URL special characters);
   - `APP_PASSWORD_HASH` (required): the line printed by `pnpm hash-password`, run on your
     computer (at least 12 characters; a long passphrase is best, the app is on the internet);
   - `SESSION_SECRET` (required): `openssl rand -base64 48`;
   - `APP_PORT` (default 3000): the port published on the server, which NPM forwards to;
   - `APP_BIND` (default `0.0.0.0`): restrict it to one address of the server if you prefer.
3. In **Configuration › Advanced**, turn off **Inject Build Args to Dockerfile**: the build
   needs no variable, and this keeps the password hash and secret out of the build.
4. Deploy. Migrations run when the `app` container starts; `pgdata` and `uploads` are kept
   between deployments.
5. In NPM, add a proxy host:
   - domain: `cabas.devgoblin.fr`; scheme `http`; forward hostname: the Coolify server's LAN IP;
     forward port: `APP_PORT`;
   - SSL tab: request a Let's Encrypt certificate, enable **Force SSL**, **HTTP/2** and **HSTS**.
   NPM sends `Host`, `X-Forwarded-For` (client address appended) and `X-Forwarded-Proto`,
   which is all the app needs. Photos up to 10 MB go through NPM's default body size limit.

### Firewall

The published port serves plain HTTP, and the login limit trusts the last `X-Forwarded-For`
entry, which only NPM must be able to set. Allow `APP_PORT` from NPM only. Docker publishes
ports around ufw/firewalld, so filter in the `DOCKER-USER` chain on the Coolify server
(replace the port and NPM's IP, then persist it, e.g. with `iptables-persistent`):

```bash
sudo iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 3000 ! -s 192.168.1.10 -j DROP
```

Without this rule the app still requires the password, but a device on the LAN could reach it
over plain HTTP and spread its login attempts over forged addresses (the global limit of 50
failures per 15 minutes still applies).

### Local test of the production stack

Set `COOKIE_SECURE=false` and `APP_BIND=127.0.0.1` in `.env` (plain HTTP on this machine), then:

```bash
docker compose --env-file .env up -d --build    # http://127.0.0.1:<APP_PORT>
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
