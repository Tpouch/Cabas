# Best practices — cabas stack

Reference guide for every technology in the stack. It complements `CLAUDE.md`: the
mandatory principles (TDD, KISS, SOLID) always take precedence. When a practice here
conflicts with KISS, choose the simpler option and note why in the PR.

Versions current as of October 2026.

| Tool | Version |
|------|---------|
| Node.js | 24 LTS |
| pnpm | 10 |
| Next.js | 16 (App Router, Turbopack) |
| React | 19.2 |
| TypeScript | 5.x, `strict` |
| PostgreSQL | 18 |
| Prisma ORM | 7 |
| Tailwind CSS | 4 |
| shadcn/ui | latest CLI (`shadcn@latest`) |
| Zod | 4 |
| Recharts | 3 |
| sharp | latest |
| Vitest | latest + Testing Library |
| Playwright | latest |

---

## pnpm

- Pin the package manager in `package.json` (`"packageManager": "pnpm@10.x.x"`) and
  enable it with `corepack enable`. Never mix in `npm` or `yarn` commands or lockfiles.
- Commit `pnpm-lock.yaml`. In CI and Docker, install with `pnpm install --frozen-lockfile`.
- pnpm 10 blocks dependency lifecycle scripts by default. Explicitly allow only the
  packages that need them (`prisma`, `@prisma/engines`, `sharp`, `esbuild`) via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml`, or with `pnpm approve-builds`.
- Add dependencies with `pnpm add` / `pnpm add -D`. Dev-only tools (types, test
  libraries, linters) always go in `devDependencies`.
- Do not hoist or use `shamefully-hoist`; if a package breaks under strict
  `node_modules`, fix the dependency declaration instead.

## Next.js 16 (App Router)

**Rendering**
- Server Components by default. Add `"use client"` only to the smallest interactive
  leaf (a form, a carousel, a dialog), never to a whole page.
- Pass only serializable props from Server to Client Components. Do not import
  server-only modules (Prisma, `fs`) into client files; mark such modules with
  `import "server-only"`.
- Route `params` and `searchParams` are async: always `await` them.
- Load independent data in parallel with `Promise.all`, never with sequential `await`s.
- Wrap repeated reads within one request in React `cache()` to avoid duplicate queries.
- This app shows personal, frequently changing data: keep pages dynamic. Do not enable
  Cache Components / `use cache` until a measured performance problem justifies it (KISS).

**Server Actions**
- A Server Action is a public HTTP endpoint. Always validate its input with Zod, even
  if the form already validates on the client.
- Keep actions thin: parse → call domain / repository → `revalidatePath` (or
  `revalidateTag`) → return a typed result. No business logic inline.
- Return a discriminated result (`{ ok: true, data } | { ok: false, errors }`) instead
  of throwing for expected failures (validation, not found). Throw only for
  unexpected errors.
- Use `useActionState` for form state and errors, and `useFormStatus` for pending
  submit buttons. Forms must still submit without JavaScript (progressive enhancement).
- Never leak stack traces or raw database errors to the UI.

**Structure and routing**
- Keep `src/app/` thin: pages compose components and call repositories; no logic.
- Use route groups `(…)` to share layouts without affecting URLs.
- Provide `loading.tsx` and `error.tsx` per main section, plus `not-found.tsx`.
- Use `next/link` for navigation and `next/image` for images (see Images below).
- Set metadata through the `metadata` export, and the PWA manifest through
  `app/manifest.ts`.

**Configuration**
- `output: "standalone"` in `next.config.ts` for the Docker image.
- Turbopack is the default bundler; do not add webpack customizations.
- Read environment variables only on the server, validated once at startup with a
  Zod schema (`src/lib/env.ts`). Never prefix secrets with `NEXT_PUBLIC_`.
- ESLint uses a flat config (`eslint.config.mjs`) with `eslint-config-next`
  (`next lint` no longer exists).

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess` and `noImplicitOverride`.
- No `any`. Use `unknown` at boundaries, then narrow with Zod.
- Prefer `type` aliases and discriminated unions; avoid enums (use string literal
  unions or `as const` objects).
- Use the path alias `@/*` → `src/*`; no deep relative imports (`../../../`).
- Infer types from Zod schemas (`z.infer`) and Prisma, rather than duplicating them.
  The domain defines its own types; map Prisma rows to domain types in repositories.

## PostgreSQL 18

- Use the official `postgres:18-alpine` image.
- PostgreSQL 18 images changed the data path: mount the volume at
  `/var/lib/postgresql` (not `/var/lib/postgresql/data`, which now fails at start).
- Credentials come from `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`),
  never hard-coded. The `db` service is not published on a host port in production;
  only `app` reaches it over the compose network.
- Add a `healthcheck` (`pg_isready`) and make `app` depend on
  `condition: service_healthy`.
- Back up with `pg_dump -Fc` plus a copy of the `uploads` volume, as documented in the
  README.

## Prisma ORM 7

- Use the `prisma-client` generator with an explicit `output` (e.g.
  `src/generated/prisma`, git-ignored) and import the client from that path.
- Configure the CLI in `prisma.config.ts` (schema path, migrations path, datasource
  URL from the environment).
- Prisma 7 requires a driver adapter: use `@prisma/adapter-pg` and pass it to
  `new PrismaClient({ adapter })`. Configure the `pg` pool explicitly (connection
  timeout, max connections): its defaults differ from Prisma 6.
- Instantiate one client per process (`src/server/db.ts`), cached on `globalThis` in
  development to survive hot reloads.
- Schema conventions: `PascalCase` models, `camelCase` fields, `@@map`/`@map` to
  `snake_case` tables and columns. Every model has `id` (`String @id @default(uuid(7))`
  or `cuid()`), `createdAt`, and `updatedAt`.
- Money: `Int` in cents. Quantities that can be fractional (0.75 kg): `Decimal`,
  converted to a domain value object at the repository boundary.
- Add indexes for every foreign key and for frequent filters (e.g.
  `PriceObservation(productId, storeId, observedAt)`).
- Multi-step writes (a purchase with its lines and price observations) run in a single
  `prisma.$transaction`.
- Migrations: `prisma migrate dev` locally, `prisma migrate deploy` at container start.
  Never edit a committed migration; create a new one.
- Use `select`/`include` deliberately to avoid over-fetching and N+1 queries.

## Zod 4

- Define one schema per input in `src/server/actions/<feature>.schema.ts`, separate
  from the action, so it can be unit-tested and reused by client forms.
- Use `z.coerce` for `FormData` values (numbers, dates) and parse euros into cents
  in a single dedicated schema helper.
- Use `safeParse` in actions and map issues to field errors with `z.flattenError`
  (or `z.treeifyError`); never expose raw issues.
- Write error messages in French, since they are shown to the user.
- Validate files: MIME type, maximum size (e.g. 10 MB), and confirm the content is
  an image by decoding it with sharp.

## Tailwind CSS 4

- CSS-first configuration: theme tokens live in `src/app/globals.css` under `@theme`.
  There is no `tailwind.config.js`.
- Mobile first: unprefixed utilities target phones; add `md:` / `lg:` for larger screens.
- Use design tokens (CSS variables) for colors, radius and spacing; no arbitrary
  hex values scattered in components.
- Merge conditional classes with the `cn()` helper (`clsx` + `tailwind-merge`) from
  shadcn.
- Extract a component when a class list repeats; avoid `@apply` except in base styles.
- Respect `prefers-reduced-motion` and support dark mode through CSS variables.

## shadcn/ui

- Add components with `pnpm dlx shadcn@latest add <component>`; they are copied into
  `src/components/ui/` and become our code.
- Keep `ui/` components generic. Build feature components (e.g. `PriceList`,
  `StoreSelect`) on top of them in `src/components/<feature>/`, instead of modifying
  the `ui/` primitives.
- Use `Drawer` (bottom sheet) on mobile and `Dialog` on desktop for the same popup
  (responsive dialog pattern), e.g. "add a price".
- Rely on the built-in Radix accessibility (focus trap, ARIA, keyboard); do not
  remove it.
- Use `Form` primitives with labels and error messages for every field.

## Recharts 3

- Charts are Client Components; load data in the parent Server Component and pass
  plain, pre-aggregated arrays as props.
- Aggregate in the domain or in SQL, never in the chart component.
- Wrap charts in `ResponsiveContainer`, and give them an accessible title and a text
  summary (e.g. the monthly total) for screen readers.
- Format euros and dates with the shared `Intl` helpers in `src/lib/format.ts`.

## Images (sharp + uploads volume)

- Process every upload on the server: `rotate()` (apply EXIF orientation), strip
  metadata, resize (max ~1600 px for receipts, ~800 px for products/logos), and
  encode as WebP. Also generate a thumbnail (~300 px).
- Store files under the `uploads` volume with generated names (UUID); never trust the
  client filename. Save only the relative path in the database.
- Serve them through a Route Handler that validates the path (no `..`) and sets
  `Cache-Control: public, max-age=31536000, immutable`, since names never change.
- Render with `next/image` and `unoptimized`, because files are already optimized.
- Mobile capture: `<input type="file" accept="image/*" capture="environment">`.
- Delete the files when the owning record is deleted.

## Testing (Vitest, Testing Library, Playwright)

- Follow TDD: red → green → refactor. A failing test always comes first.
- Vitest projects:
  - `unit`: `src/domain/**` and `src/lib/**`, node environment, no I/O.
  - `integration`: repositories and Server Actions against a real PostgreSQL 18 started
    with `@testcontainers/postgresql`. Run `prisma migrate deploy` once per run, and
    truncate tables between tests.
  - `components`: Client Components with Testing Library in `jsdom`.
- Async Server Components are not unit-tested; cover them with Playwright, as the
  Next.js docs recommend.
- Query by role and label (`getByRole`, `getByLabelText`), not by test IDs or CSS
  classes. Interact with `@testing-library/user-event`.
- Use small factory functions (`makeProduct({...})`) for test data; no shared mutable
  fixtures.
- Playwright: only the key flows (record a purchase, add a price, convert a shopping
  list into a purchase), run against the production build, with a mobile viewport
  project (e.g. Pixel 7) and a desktop project.
- Tests must be deterministic: inject the clock (`now`) into the domain instead of
  calling `new Date()` inside business logic.

## Docker

- Multi-stage `Dockerfile` based on `node:24-alpine`: `deps` (pnpm install with a
  frozen lockfile) → `build` (`prisma generate` + `next build`) → `runner`
  (standalone output only).
- Enable pnpm in the image with `corepack enable`, and use a BuildKit cache mount for
  the pnpm store.
- Run as a non-root user (`node`), with `NODE_ENV=production`.
- Entrypoint: `prisma migrate deploy`, then `node server.js`.
- Add a `.dockerignore` (`node_modules`, `.next`, `.git`, `uploads`, `.env*`).
- `docker-compose.yml`: `app` + `db`, named volumes `pgdata` and `uploads`,
  `restart: unless-stopped`, a healthcheck on both services, and configuration via
  `.env`. Commit an `.env.example` with no secrets.

## Accessibility and mobile UX

- Touch targets ≥ 44 px, primary actions within thumb reach (bottom navigation,
  floating "new purchase" button).
- Inputs use the right `inputMode` (`decimal` for prices and quantities) and a font size
  ≥ 16 px to prevent iOS zoom.
- Respect safe areas (`env(safe-area-inset-*)`) and use `dvh` instead of `vh`.
- Every field has a visible label; every image has a meaningful `alt`.
- Check color contrast (WCAG AA) in both light and dark themes.

## Sources

- [Next.js blog — releases](https://nextjs.org/blog)
- [Next.js testing guide](https://nextjs.org/docs/app/guides/testing)
- [Prisma ORM 7 — upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma ORM 7 — database drivers](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers)
- [Prisma config reference](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)
- [PostgreSQL Docker image — PGDATA change in 18](https://github.com/docker-library/postgres/issues/1370)
- [Testcontainers PostgreSQL with Node](https://qaskills.sh/blog/testcontainers-postgresql-node-complete-guide)
- [Zod v4 with Next.js](https://noqta.tn/tutorials/zod-v4-nextjs-schema-validation-forms-apis-2026)
- [Server Actions for forms — Vercel Academy](https://vercel.com/academy/nextjs-foundations/server-actions-for-forms)
