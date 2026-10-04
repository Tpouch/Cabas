# CLAUDE.md — cabas

Next.js agent rules: @AGENTS.md

Self-hosted, mobile-first web app to record grocery purchases, track spending, compare
product prices across stores, and prepare shopping lists with a cost estimate per store.

- Single user, no authentication: access is restricted to the NetBird network.
- Hosting: homelab, via `docker compose` (services `app` + `db`).
- UI language: French. Code language (identifiers, file names): English.
- **All documentation is written in English** (this file, README, specs, plans, code comments).
- Specs and plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- **Stack best practices: [`docs/best-practices.md`](docs/best-practices.md).** Read the
  relevant section before working with a given tool, and follow it.

## Stack

| Role | Choice |
|------|--------|
| Runtime / package manager | Node.js 24 LTS, **pnpm** 10 |
| Framework | Next.js 16 (App Router), React 19.2, TypeScript strict |
| Database | PostgreSQL 18 |
| ORM / migrations | Prisma 7 (`@prisma/adapter-pg`) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Charts | Recharts 3 |
| Images | sharp (resize + thumbnails on upload) |
| Validation | Zod 4 (form inputs and Server Actions) |
| Unit / integration tests | Vitest (+ Testing Library, Testcontainers) |
| End-to-end tests | Playwright (critical flows only) |
| Deployment | Docker (Next.js `standalone` image, multi-stage build) |

Use **pnpm only**: never `npm` or `yarn`. Do not add a dependency without a clear
reason; prefer what the stack already provides.

## Mandatory principles

These three principles apply to **every** change, without exception.

### TDD — Test-Driven Development

1. **Red**: first write a failing test that describes the expected behavior.
2. **Green**: write the minimum code to make it pass.
3. **Refactor**: clean up while keeping tests green.

- No production code without a test that requires it first.
- For a bug: first write the test that reproduces it, then fix it.
- Business logic (`src/domain/`): pure unit tests, no database or network.
- Data access and Server Actions: integration tests against a real PostgreSQL test
  database (no Prisma mocks).
- Components: test user-visible behavior (Testing Library), not implementation details.
- Async Server Components and key flows: Playwright (record a purchase, add a price,
  convert a shopping list into a purchase).
- One test = one behavior, named as a sentence:
  `it("computes the price per kilo of a 500 g product")`.

### KISS — Keep It Simple, Stupid

- The simplest solution that meets the current need. No "just in case" abstraction (YAGNI).
- Server Components by default; `"use client"` only where interactivity requires it.
- Server Actions for mutations; no REST API layer until a real need exists.
- No global state manager: server state via server rendering, local state via `useState`.
- Short, focused files; a growing file is a sign it does too much.
- No dead code, no commented-out code, no TODO without a ticket.

### SOLID

- **S** — Single responsibility: one module = one reason to change. Business logic
  knows nothing about React, Prisma, or Next.js.
- **O** — Open/closed: extend through composition (new components, new functions)
  rather than modifying stable code with cascading `if`s.
- **L** — Liskov substitution: an implementation must honor its interface contract
  (types and behavior).
- **I** — Interface segregation: small, focused types and props rather than one
  catch-all object.
- **D** — Dependency inversion: the domain defines the interfaces it needs (e.g. a price
  repository); the infrastructure (Prisma, file system) implements them.

Apply SOLID pragmatically: it serves KISS, it never justifies over-engineering.

## Code architecture

```
src/
  app/            # Next.js routes (pages, layouts, route handlers): thin, no business logic
  components/     # Reusable UI components (ui/ = shadcn)
  domain/         # Pure business logic: unit price, estimates, statistics (100% tested)
  server/
    actions/      # Server Actions: Zod validation → domain/repository call → revalidation
    repositories/ # Data access through Prisma
    storage/      # Photo storage and processing (sharp, uploads volume)
  lib/            # Cross-cutting utilities (currency formatting, dates, env)
  generated/      # Prisma client output (git-ignored)
prisma/
  schema.prisma
  migrations/
tests/
  e2e/            # Playwright
```

Dependency rule: `app` → `server` → `domain`. The domain depends on nothing but itself.
Unit and integration tests sit next to the file under test (`foo.ts` + `foo.test.ts`).

## Code conventions

- TypeScript `strict`, no `any`; prefer `unknown` + Zod validation at boundaries.
- All incoming data (form, URL parameter, file) is validated with Zod before it
  reaches the domain.
- Amounts are stored as **integer cents** (`Int`), never floats. Format as euros only
  for display.
- Product size is stored in a base unit (`g`, `ml`, `piece`) to allow comparison per
  kilo / per litre / per piece.
- Naming: `camelCase` (variables, functions), `PascalCase` (components, types),
  `kebab-case` (non-component files).
- Mobile first: base styles for phones, then `md:` / `lg:` for desktop. Touch targets
  of at least 44 px.
- Accessibility: labels on every field, sufficient contrast, keyboard navigation on desktop.
- User-facing error messages in French, clear and actionable.
- Versioned Prisma migrations; never edit a committed migration.

## Commands

Keep this section up to date as the project is set up.

```bash
pnpm install                 # install dependencies
pnpm dev                     # development server
pnpm test                    # Vitest (unit + integration + components)
pnpm test:e2e                # Playwright
pnpm lint                    # ESLint
pnpm typecheck               # tsc --noEmit
pnpm prisma migrate dev      # create/apply a migration locally
docker compose up -d --build # run the full stack
pnpm hash-password           # generate APP_PASSWORD_HASH for .env
```

Before every commit: `pnpm lint && pnpm typecheck && pnpm test` must pass.

## Git and commits

- **Conventional Commits** are mandatory: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `build`, `ci`, `perf`.
  - Optional lowercase scope: `feat(products): add price per unit comparison`.
  - Imperative description, in English, no initial capital, no trailing period.
  - `BREAKING CHANGE:` footer when needed.
- Small, atomic commits: one logical change per commit, tests included.
- **No mention of Claude or any AI** in commits or PRs: no `Co-Authored-By`, no
  "Generated with Claude Code", no robot emoji.
- Main branch: `main`. Work on `feat/…` and `fix/…` branches.
