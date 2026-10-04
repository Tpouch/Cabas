# cabas — Single-password authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the whole app behind one password: a `/login` page, a signed 30-day session cookie, a global login rate limit, a session check in the proxy and in every Server Action and Route Handler, a logout button, and security headers.

**Architecture:** Pure crypto helpers (scrypt password hash, HMAC session token, rate limiter, access decision, security headers) live in `src/lib/auth/` and `src/lib/security-headers.ts` and are unit-tested. `src/server/auth/session.ts` wraps them with Next's `cookies()` (set, clear, `requireSession`). `src/proxy.ts` makes the optimistic check on every request; each action and the uploads route re-check (defense in depth, as the Next.js 16 auth guide recommends). Pages move into an `(app)` route group so `/login` renders without the navigation.

**Tech Stack:** Next.js 16 (`proxy.ts`, Server Actions, `cookies()`), Node `crypto` (scrypt, HMAC, `timingSafeEqual`), Zod 4, Vitest, Playwright. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md) §2.1 (Authentication).

## Global Constraints

- pnpm only; TDD (failing test first, watch it fail, minimal code); Conventional Commits in English, no AI mention.
- Password stored only as `scrypt:<N>:<r>:<p>:<salt b64url>:<hash b64url>` in `APP_PASSWORD_HASH` (no `$`, so Docker Compose does not interpolate it).
- Session cookie `cabas_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, `Secure` only when `COOKIE_SECURE=true`. Signing key = `SESSION_SECRET` + `:` + `APP_PASSWORD_HASH`.
- `SESSION_SECRET` ≥ 32 characters. Missing or invalid auth configuration fails closed (no access), never open.
- Login limit: 5 failures within 15 minutes → refused for the rest of the 15 minutes, global (not per client).
- Public paths: `/login`, `/icon.svg`, `/apple-icon.png`, `/_next/static/*`, `/_next/image*`, `/favicon.ico`. Everything else needs the session.
- After login, redirect only to a same-site path (`/x`, never `//x`, `/\x` or an absolute URL).
- French UI copy with `’` in JSX text; error messages in Server Actions keep the straight `'` already used by the app.
- `pnpm lint && pnpm typecheck && pnpm test` pass before every commit.

## Review Focus

1. **Open redirect through `next`** (`/login?next=//evil.example`, `https://evil.example`, `/\evil`): the user always lands on a page of the app. Pinned in Task 3.
2. **Forged or replayed cookies** (edited expiry, token from another secret, token issued before a password change, garbage): rejected everywhere. Pinned in Tasks 1 and 3.
3. **A Server Action called directly without a session** (a POST crafted by hand, bypassing pages): refused for every exported action. Pinned in Task 4.
4. **Uploaded photos fetched without a session** (`/uploads/products/x.webp`): 401, not the image. Pinned in Task 4.
5. **Brute force**: the 6th attempt inside 15 minutes is refused even with the right password, and the limit lifts after the window. Pinned in Tasks 2 and 3.

---

## File Structure

```
src/lib/auth/password.ts          # hashPassword, verifyPassword (scrypt) — no server-only import (used by the CLI script)
src/lib/auth/session-token.ts     # createSessionToken, isValidSessionToken, sessionSigningKey, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS
src/lib/auth/rate-limit.ts        # LoginLimiter
src/lib/auth/access.ts            # isPublicPath, decideAccess, safeNextPath
src/lib/security-headers.ts       # securityHeaders({ production })
src/lib/env.ts                    # + parseAuthEnv, getAuthEnv
src/server/auth/session.ts        # startSession, endSession, hasSession, requireSession, UnauthorizedError
src/server/auth/login-limiter.ts  # loginLimiter singleton
src/server/actions/auth.ts        # loginAction, logoutAction
src/server/actions/*.ts           # + await requireSession() first in every exported action
src/app/uploads/[...path]/route.ts# + 401 without session
src/proxy.ts                      # optimistic check on every request
src/app/layout.tsx                # html/body/fonts/toaster only
src/app/(app)/layout.tsx          # AppNav + main (moved from the root layout)
src/app/(app)/{page.tsx,products,stores,purchases}  # moved, URLs unchanged
src/app/(auth)/login/page.tsx     # login screen
src/components/auth/login-form.tsx, logout-button.tsx
scripts/hash-password.ts          # pnpm hash-password
tests/setup/cookie-jar.ts         # in-memory cookie store for integration tests
tests/e2e/global-setup.ts, auth.spec.ts
next.config.ts                    # headers()
```

---

### Task 1: Password hash and session token

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/session-token.ts`
- Test: `src/lib/auth/password.test.ts`, `src/lib/auth/session-token.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): string` — `scrypt:16384:8:1:<salt>:<hash>`, random 16-byte salt, 64-byte key.
  - `verifyPassword(password: string, stored: string): boolean` — constant-time; `false` for any malformed `stored`.
  - `SESSION_COOKIE = "cabas_session"`, `SESSION_MAX_AGE_SECONDS = 2_592_000` (30 days).
  - `createSessionToken(expiresAtMs: number, key: string): string` — `v1.<expiresAtMs>.<HMAC-SHA256 b64url>`.
  - `isValidSessionToken(token: string | undefined, key: string, nowMs: number): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores a salted scrypt hash, never the password", () => {
    const stored = hashPassword("courses du samedi");
    expect(stored).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain("courses");
    expect(hashPassword("courses du samedi")).not.toBe(stored);
  });

  it("accepts the right password and rejects others", () => {
    const stored = hashPassword("courses du samedi");
    expect(verifyPassword("courses du samedi", stored)).toBe(true);
    expect(verifyPassword("courses du dimanche", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it.each(["", "plain", "scrypt:16384:8:1:abc", "bcrypt:1:2:3:abc:def", "scrypt:x:8:1:abc:def"])(
    "rejects a malformed stored hash %j",
    (stored) => {
      expect(verifyPassword("anything", stored)).toBe(false);
    },
  );
});
```

Create `src/lib/auth/session-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken } from "./session-token";

const key = "k".repeat(40);
const now = Date.UTC(2026, 9, 4, 12);

describe("session token", () => {
  it("is valid until it expires", () => {
    const token = createSessionToken(now + 1000, key);
    expect(isValidSessionToken(token, key, now)).toBe(true);
    expect(isValidSessionToken(token, key, now + 1000)).toBe(false);
  });

  it("is rejected when signed with another key (other secret or changed password)", () => {
    const token = createSessionToken(now + 1000, key);
    expect(isValidSessionToken(token, "other".repeat(10), now)).toBe(false);
  });

  it("is rejected when its expiry is edited", () => {
    const token = createSessionToken(now + 1000, key);
    const [version, , signature] = token.split(".");
    expect(isValidSessionToken(`${version}.${now + 999_999_999}.${signature}`, key, now)).toBe(false);
  });

  it.each([undefined, "", "garbage", "v1.123", "v2.9999999999999.sig", "v1.abc.sig", "v1.1.2.3"])(
    "rejects %j",
    (token) => {
      expect(isValidSessionToken(token, key, now)).toBe(false);
    },
  );
});
```

Run: `pnpm test src/lib/auth`
Expected: FAIL — modules `./password` and `./session-token` not found.

- [ ] **Step 2: Implement**

Create `src/lib/auth/password.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// No "server-only" import: scripts/hash-password.ts runs this file directly with Node.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash, ...rest] = stored.split(":");
  if (scheme !== "scrypt" || rest.length > 0 || !salt || !hash) return false;
  const params = [n, r, p].map(Number);
  if (params.some((value) => !Number.isInteger(value) || value <= 0)) return false;
  const [cost, blockSize, parallelization] = params as [number, number, number];
  const expected = Buffer.from(hash, "base64url");
  if (expected.length === 0) return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });
  return timingSafeEqual(actual, expected);
}
```

Create `src/lib/auth/session-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "cabas_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(expiresAtMs: number, key: string): string {
  const payload = `v1.${expiresAtMs}`;
  return `${payload}.${sign(payload, key)}`;
}

export function isValidSessionToken(token: string | undefined, key: string, nowMs: number): boolean {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return false;
  const [version, expiry, signature] = parts as [string, string, string];
  if (version !== "v1" || !/^\d+$/.test(expiry)) return false;
  const expected = Buffer.from(sign(`${version}.${expiry}`, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(expiry) > nowMs;
}
```

Run: `pnpm test src/lib/auth`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth
git commit -m "feat(auth): hash passwords with scrypt and sign session tokens"
```

---

### Task 2: Auth configuration and login rate limit

**Files:**
- Create: `src/lib/auth/rate-limit.ts`
- Modify: `src/lib/env.ts`
- Test: `src/lib/auth/rate-limit.test.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Produces:
  - `type AuthEnv = { APP_PASSWORD_HASH: string; SESSION_SECRET: string; COOKIE_SECURE: boolean }`
  - `parseAuthEnv(source: Record<string, string | undefined>): AuthEnv` and `getAuthEnv(): AuthEnv` — throw on missing or invalid values.
  - `class LoginLimiter(maxFailures = 5, windowMs = 900_000)` with `retryAfterMs(nowMs: number): number` (0 when allowed), `recordFailure(nowMs: number): void`, `reset(): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LoginLimiter } from "./rate-limit";

const minute = 60_000;

describe("LoginLimiter", () => {
  it("allows 5 failures, then blocks until the 15-minute window ends", () => {
    const limiter = new LoginLimiter();
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.retryAfterMs(start + i)).toBe(0);
      limiter.recordFailure(start + i);
    }
    expect(limiter.retryAfterMs(start + 5 * minute)).toBe(10 * minute);
    expect(limiter.retryAfterMs(start + 15 * minute)).toBe(0);
  });

  it("starts a new window once the previous one is over", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 4; i += 1) limiter.recordFailure(0);
    limiter.recordFailure(16 * minute);
    expect(limiter.retryAfterMs(16 * minute)).toBe(0);
  });

  it("forgets failures after a successful login", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure(0);
    limiter.reset();
    expect(limiter.retryAfterMs(1)).toBe(0);
  });
});
```

Append to `src/lib/env.test.ts`:

```ts
describe("parseAuthEnv", () => {
  const valid = {
    APP_PASSWORD_HASH: "scrypt:16384:8:1:c2FsdA:aGFzaA",
    SESSION_SECRET: "s".repeat(32),
  };

  it("reads the password hash, the session secret and the cookie flag", () => {
    expect(parseAuthEnv(valid)).toEqual({ ...valid, COOKIE_SECURE: false });
    expect(parseAuthEnv({ ...valid, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
  });

  it.each([
    [{ APP_PASSWORD_HASH: undefined }],
    [{ APP_PASSWORD_HASH: "my-password" }],
    [{ SESSION_SECRET: "too-short" }],
    [{ COOKIE_SECURE: "yes" }],
  ])("refuses %j", (override) => {
    expect(() => parseAuthEnv({ ...valid, ...override })).toThrow();
  });
});
```

and change the import line of `src/lib/env.test.ts` to `import { parseAuthEnv, parseEnv } from "./env";`.

Run: `pnpm test src/lib`
Expected: FAIL — `./rate-limit` missing, `parseAuthEnv` not exported.

- [ ] **Step 2: Implement**

Create `src/lib/auth/rate-limit.ts`:

```ts
/**
 * Global login limiter (single user, single process). Kept in memory: a restart clears it,
 * which only gives an attacker 5 more tries per restart.
 */
export class LoginLimiter {
  private failures = 0;
  private windowStart = 0;

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  private windowOver(nowMs: number): boolean {
    return nowMs - this.windowStart >= this.windowMs;
  }

  retryAfterMs(nowMs: number): number {
    if (this.failures < this.maxFailures || this.windowOver(nowMs)) return 0;
    return this.windowStart + this.windowMs - nowMs;
  }

  recordFailure(nowMs: number): void {
    if (this.failures === 0 || this.windowOver(nowMs)) {
      this.failures = 0;
      this.windowStart = nowMs;
    }
    this.failures += 1;
  }

  reset(): void {
    this.failures = 0;
    this.windowStart = 0;
  }
}
```

Append to `src/lib/env.ts`:

```ts
const authEnvSchema = z.object({
  APP_PASSWORD_HASH: z
    .string()
    .regex(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/, "APP_PASSWORD_HASH must be generated with `pnpm hash-password`"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  return authEnvSchema.parse(source);
}

export function getAuthEnv(): AuthEnv {
  return parseAuthEnv(process.env);
}
```

Run: `pnpm test src/lib`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib
git commit -m "feat(auth): validate auth configuration and limit login attempts"
```

---

### Task 3: Server session, login and logout

**Files:**
- Modify: `src/lib/auth/session-token.ts` (add `sessionSigningKey`)
- Create: `src/lib/auth/access.ts` (`safeNextPath` for now), `src/server/auth/session.ts`, `src/server/auth/login-limiter.ts`, `src/server/actions/auth.ts`, `tests/setup/cookie-jar.ts`
- Modify: `tests/setup/integration.ts`
- Test: `src/lib/auth/access.test.ts`, `src/server/actions/auth.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `text`, `failure`, `ActionResult`, `ActionState` (Plan 1).
- Produces:
  - `sessionSigningKey(secret: string, passwordHash: string): string` — `"<secret>:<hash>"`.
  - `safeNextPath(next: string | null | undefined): string` — the path when it starts with a single `/` (not `//`, not `/\`), otherwise `"/"`; `/login` itself maps to `"/"`.
  - `class UnauthorizedError extends Error`; `startSession(nowMs?: number): Promise<void>`; `endSession(): Promise<void>`; `hasSession(nowMs?: number): Promise<boolean>` (false on missing configuration); `requireSession(): Promise<void>` (throws `UnauthorizedError`).
  - `loginLimiter: LoginLimiter` (process-wide).
  - `loginAction(prev: ActionState<null>, formData: FormData): Promise<ActionResult<null>>` — fields `password`, `next`; redirects on success.
  - `logoutAction(): Promise<void>` — clears the cookie, redirects to `/login`.
  - Integration harness: `cookieJar` (Map of name → `{ value, options }`) backs `next/headers` `cookies()`; before each test it holds a valid session and `loginLimiter` is reset. Test password: `"test-password"`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/auth/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./access";

describe("safeNextPath", () => {
  it.each([
    ["/products", "/products"],
    ["/products/0199?x=1", "/products/0199?x=1"],
    ["/", "/"],
  ])("keeps the app path %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([null, undefined, "", "products", "//evil.example", "/\\evil.example", "https://evil.example", "/login", "/login?next=/x"])(
    "sends %j back to the home page",
    (next) => {
      expect(safeNextPath(next)).toBe("/");
    },
  );
});
```

Create `tests/setup/cookie-jar.ts`:

```ts
/** In-memory stand-in for Next's cookie store in integration tests. */
export type StoredCookie = { value: string; options: Record<string, unknown> };
export const cookieJar = new Map<string, StoredCookie>();
```

Create `src/server/actions/auth.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { hasSession, requireSession, UnauthorizedError } from "@/server/auth/session";
import { cookieJar } from "../../../tests/setup/cookie-jar";
import { loginAction, logoutAction } from "./auth";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("loginAction", () => {
  it("logs in with the right password, sets a 30-day HttpOnly cookie and returns to the page", async () => {
    cookieJar.clear();
    await expect(loginAction(null, form({ password: "test-password", next: "/products" }))).rejects.toThrow(
      "NEXT_REDIRECT:/products",
    );
    expect(cookieJar.get(SESSION_COOKIE)?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 2_592_000,
    });
    expect(await hasSession()).toBe(true);
  });

  it("refuses a wrong password and sets no cookie", async () => {
    cookieJar.clear();
    expect(await loginAction(null, form({ password: "nope", next: "/" }))).toEqual({
      ok: false,
      errors: { password: ["Mot de passe incorrect."] },
    });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("never sends the user outside the app", async () => {
    cookieJar.clear();
    await expect(loginAction(null, form({ password: "test-password", next: "//evil.example" }))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
  });

  it("blocks the 6th attempt within 15 minutes, even with the right password", async () => {
    cookieJar.clear();
    for (let i = 0; i < 5; i += 1) await loginAction(null, form({ password: "wrong" }));
    const result = await loginAction(null, form({ password: "test-password" }));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/^Trop d'essais\. Réessaie dans 15 min\.$/) });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("explains a missing server configuration instead of crashing", async () => {
    const secret = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(await loginAction(null, form({ password: "test-password" }))).toMatchObject({
        ok: false,
        message: "La connexion n'est pas configurée sur le serveur.",
      });
      expect(await hasSession()).toBe(false);
    } finally {
      process.env.SESSION_SECRET = secret;
    }
  });
});

describe("session checks", () => {
  it("rejects a session signed before the password changed", async () => {
    const hash = process.env.APP_PASSWORD_HASH;
    expect(await hasSession()).toBe(true);
    process.env.APP_PASSWORD_HASH = hashPassword("new-password");
    try {
      expect(await hasSession()).toBe(false);
    } finally {
      process.env.APP_PASSWORD_HASH = hash;
    }
  });

  it("requires a session", async () => {
    await expect(requireSession()).resolves.toBeUndefined();
    cookieJar.clear();
    await expect(requireSession()).rejects.toThrow(UnauthorizedError);
  });

  it("logs out by deleting the cookie", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});
```

Run: `pnpm test src/lib/auth src/server/actions/auth.test.ts`
Expected: FAIL — `./access`, `@/server/auth/session` and `./auth` not found.

- [ ] **Step 2: Implement the pure helpers**

Append to `src/lib/auth/session-token.ts`:

```ts
/** Ties sessions to the password: changing it invalidates every existing cookie. */
export function sessionSigningKey(secret: string, passwordHash: string): string {
  return `${secret}:${passwordHash}`;
}
```

Create `src/lib/auth/access.ts`:

```ts
/** Only same-site paths: blocks open redirects such as //evil.example or /\evil.example. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === "/login" || next.startsWith("/login?")) return "/";
  return next;
}
```

Run: `pnpm test src/lib/auth`
Expected: PASS.

- [ ] **Step 3: Implement the server session and actions**

Create `src/server/auth/session.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  isValidSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionSigningKey,
} from "@/lib/auth/session-token";
import { getAuthEnv } from "@/lib/env";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export async function startSession(nowMs = Date.now()): Promise<void> {
  const env = getAuthEnv();
  const token = createSessionToken(nowMs + SESSION_MAX_AGE_SECONDS * 1000, sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Fails closed: a missing or invalid configuration means nobody is signed in. */
export async function hasSession(nowMs = Date.now()): Promise<boolean> {
  try {
    const env = getAuthEnv();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return isValidSessionToken(token, sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH), nowMs);
  } catch {
    return false;
  }
}

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new UnauthorizedError();
}
```

Create `src/server/auth/login-limiter.ts`:

```ts
import "server-only";
import { LoginLimiter } from "@/lib/auth/rate-limit";

const globalForLimiter = globalThis as unknown as { cabasLoginLimiter?: LoginLimiter };

/** One limiter per process, kept across dev hot reloads. */
export const loginLimiter = (globalForLimiter.cabasLoginLimiter ??= new LoginLimiter());
```

Create `src/server/actions/auth.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/access";
import { verifyPassword } from "@/lib/auth/password";
import { getAuthEnv } from "@/lib/env";
import { loginLimiter } from "@/server/auth/login-limiter";
import { endSession, startSession } from "@/server/auth/session";
import { text } from "./form-data";
import { type ActionResult, type ActionState, failure } from "./result";

const MAX_PASSWORD_LENGTH = 200;

export async function loginAction(_prev: ActionState<null>, formData: FormData): Promise<ActionResult<null>> {
  let passwordHash: string;
  try {
    passwordHash = getAuthEnv().APP_PASSWORD_HASH;
  } catch {
    return failure("La connexion n'est pas configurée sur le serveur.");
  }

  const now = Date.now();
  const retryAfterMs = loginLimiter.retryAfterMs(now);
  if (retryAfterMs > 0) return failure(`Trop d'essais. Réessaie dans ${Math.ceil(retryAfterMs / 60_000)} min.`);

  const password = text(formData, "password");
  if (!password || password.length > MAX_PASSWORD_LENGTH || !verifyPassword(password, passwordHash)) {
    loginLimiter.recordFailure(now);
    return { ok: false, errors: { password: ["Mot de passe incorrect."] } };
  }

  loginLimiter.reset();
  await startSession(now);
  redirect(safeNextPath(text(formData, "next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
```

- [ ] **Step 4: Back `cookies()` with the jar in integration tests**

In `tests/setup/integration.ts`:

1. After the two `process.env` lines at the top, add:

```ts
const { hashPassword } = await import("@/lib/auth/password");
process.env.APP_PASSWORD_HASH = hashPassword("test-password");
process.env.SESSION_SECRET = "integration-test-session-secret-0123456789";
process.env.COOKIE_SECURE = "false";
```

2. After `vi.mock("next/cache", …)`, add:

```ts
vi.mock("next/headers", async () => {
  const { cookieJar } = await import("./cookie-jar");
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)?.value } : undefined),
      set: (name: string, value: string, options: Record<string, unknown> = {}) => {
        cookieJar.set(name, { value, options });
      },
      delete: (name: string) => {
        cookieJar.delete(name);
      },
    }),
    headers: async () => new Headers(),
  };
});
```

3. After `const { db } = await import("@/server/db");`, add:

```ts
const { cookieJar } = await import("./cookie-jar");
const { createSessionToken, sessionSigningKey, SESSION_COOKIE } = await import("@/lib/auth/session-token");
const { loginLimiter } = await import("@/server/auth/login-limiter");
```

4. At the start of the existing `beforeEach` callback, add:

```ts
  // Every test starts signed in; tests about authentication clear the jar themselves.
  cookieJar.clear();
  const key = sessionSigningKey(process.env.SESSION_SECRET as string, process.env.APP_PASSWORD_HASH as string);
  cookieJar.set(SESSION_COOKIE, { value: createSessionToken(Date.now() + 3_600_000, key), options: {} });
  loginLimiter.reset();
```

Run: `pnpm test src/server/actions/auth.test.ts`
Expected: PASS. Then `pnpm test` — Expected: all pass (nothing else uses cookies yet).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(auth): add session cookies, login and logout actions"
```

---

### Task 4: Every Server Action and the uploads route require the session

**Files:**
- Modify: `src/server/actions/stores.ts`, `products.ts`, `prices.ts`, `alternatives.ts`, `purchases.ts`, `src/app/uploads/[...path]/route.ts`
- Test: `src/server/actions/authorization.test.ts`, `src/server/storage/uploads-route.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `hasSession`, `UnauthorizedError` (Task 3); the integration `cookieJar`.
- Produces: every exported function of the five action modules starts with `await requireSession();`; `GET /uploads/...` answers 401 without a session.

- [ ] **Step 1: Write the failing tests**

Create `src/server/actions/authorization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "@/server/auth/session";
import { db } from "@/server/db";
import { cookieJar } from "../../../tests/setup/cookie-jar";
import * as alternatives from "./alternatives";
import * as prices from "./prices";
import * as products from "./products";
import * as purchases from "./purchases";
import * as stores from "./stores";

const modules = { alternatives, prices, products, purchases, stores };
const someId = "01999999-0000-7000-8000-000000000000";

// Iterates the real exports, so an action added later without a session check fails here.
const actions = Object.entries(modules).flatMap(([moduleName, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => typeof value === "function")
    .map(([name, fn]) => [`${moduleName}.${name}`, fn as (...args: unknown[]) => Promise<unknown>] as const),
);

describe("Server Actions without a session", () => {
  it("covers every action module", () => {
    expect(actions.length).toBeGreaterThanOrEqual(12);
  });

  it.each(actions)("%s is refused", async (_name, action) => {
    cookieJar.clear();
    const form = new FormData();
    form.set("name", "Intrus");
    await expect(action(someId, null, form)).rejects.toThrow(UnauthorizedError);
    await expect(action(null, form)).rejects.toThrow(UnauthorizedError);
    expect(await db().store.count()).toBe(0);
  });
});
```

Create `src/server/storage/uploads-route.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/uploads/[...path]/route";
import { cookieJar } from "../../../tests/setup/cookie-jar";

async function request(path: string[]) {
  return GET(new Request("http://cabas.test/uploads/" + path.join("/")), { params: Promise.resolve({ path }) });
}

describe("GET /uploads", () => {
  it("serves a stored image to a signed-in user", async () => {
    await mkdir(join(process.env.UPLOADS_DIR as string, "products"), { recursive: true });
    await writeFile(join(process.env.UPLOADS_DIR as string, "products", "a.webp"), "webp");
    expect((await request(["products", "a.webp"])).status).toBe(200);
  });

  it("refuses images without a session", async () => {
    cookieJar.clear();
    expect((await request(["products", "a.webp"])).status).toBe(401);
  });
});
```

Run: `pnpm test src/server/actions/authorization.test.ts src/server/storage/uploads-route.test.ts`
Expected: FAIL — actions run without a session (they return validation errors or write data instead of throwing) and the image is served without a session.

- [ ] **Step 2: Add the session check**

In each of `src/server/actions/stores.ts`, `products.ts`, `prices.ts`, `alternatives.ts` and `purchases.ts`:

1. Add the import `import { requireSession } from "@/server/auth/session";` with the other `@/server/...` imports.
2. Make `await requireSession();` the first statement of every `export async function …Action(…)` body (before parsing input). The functions are:
   - `stores.ts`: `createStoreAction`, `updateStoreAction`, `deleteStoreAction`
   - `products.ts`: `createProductAction`, `updateProductAction`, `deleteProductAction`
   - `prices.ts`: `addPriceAction`
   - `alternatives.ts`: `addAlternativeAction`, `removeAlternativeAction`
   - `purchases.ts`: `createPurchaseAction`, `updatePurchaseAction`, `deletePurchaseAction`

For example, `deleteStoreAction` becomes:

```ts
export async function deleteStoreAction(id: string): Promise<ActionResult<null>> {
  await requireSession();
  try {
    const store = await deleteStore(id);
    // … unchanged
```

In `src/app/uploads/[...path]/route.ts`, add `import { hasSession } from "@/server/auth/session";` and make the first statement of `GET`:

```ts
  if (!(await hasSession())) return new Response("Unauthorized", { status: 401 });
```

- [ ] **Step 3: Run the tests to see them pass**

Run: `pnpm test --project integration`
Expected: PASS — the new tests and every existing integration test (they run signed in by default).

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(auth): require the session in every server action and for uploads"
```

---

### Task 5: Proxy, login page and logout

**Files:**
- Modify: `src/lib/auth/access.ts`, `src/app/layout.tsx`, `src/components/layout/app-nav.tsx`, `src/components/layout/app-nav.test.tsx`
- Move (git mv, URLs unchanged): `src/app/page.tsx`, `src/app/products`, `src/app/stores`, `src/app/purchases` → `src/app/(app)/`
- Create: `src/proxy.ts`, `src/app/(app)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/logout-button.tsx`
- Modify: `src/app/(app)/page.tsx` (logout on mobile)
- Test: `src/lib/auth/access.test.ts`, `src/components/auth/login-form.test.tsx`

**Interfaces:**
- Consumes: `safeNextPath`, `isValidSessionToken`, `sessionSigningKey`, `SESSION_COOKIE`, `getAuthEnv`, `loginAction`, `logoutAction`, `useFormAction`, `FieldError`, `SubmitButton`, `LogoMark`.
- Produces:
  - `isPublicPath(pathname: string): boolean`
  - `type Access = { kind: "allow" } | { kind: "redirect"; location: string } | { kind: "unauthorized" }`
  - `decideAccess(input: { pathname: string; search: string; method: string; authenticated: boolean }): Access` — public paths allowed (a signed-in `GET /login` goes to `/`); signed in → allow; `/uploads/*` → unauthorized; other `GET`/`HEAD` → redirect to `/login?next=<path+search>`; any other method → unauthorized.
  - `<LoginForm action next />`, `<LogoutButton className? />`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/auth/access.test.ts`:

```ts
describe("decideAccess", () => {
  const request = (pathname: string, authenticated: boolean, method = "GET", search = "") =>
    decideAccess({ pathname, search, method, authenticated });

  it.each(["/login", "/icon.svg", "/apple-icon.png", "/favicon.ico", "/_next/static/chunks/a.js", "/_next/image"])(
    "lets anyone reach %s",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(true);
      expect(request(pathname, false)).toEqual({ kind: "allow" });
    },
  );

  it("sends a visitor to the login page and back to where they were going", () => {
    expect(request("/products", false, "GET", "?q=lait")).toEqual({
      kind: "redirect",
      location: "/login?next=%2Fproducts%3Fq%3Dlait",
    });
  });

  it("answers 401 to images and form posts without a session", () => {
    expect(request("/uploads/products/a.webp", false)).toEqual({ kind: "unauthorized" });
    expect(request("/products", false, "POST")).toEqual({ kind: "unauthorized" });
  });

  it("lets a signed-in user through, and skips the login page", () => {
    expect(request("/products", true)).toEqual({ kind: "allow" });
    expect(request("/uploads/products/a.webp", true)).toEqual({ kind: "allow" });
    expect(request("/login", true)).toEqual({ kind: "redirect", location: "/" });
    expect(request("/login", true, "POST")).toEqual({ kind: "allow" });
  });

  it.each(["/loginx", "/icon.svg.png", "/_next/data/x.json"])("does not treat %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});
```

and change its import to `import { decideAccess, isPublicPath, safeNextPath } from "./access";`.

Create `src/components/auth/login-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("sends the password and where to go next", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {} });
    render(<LoginForm action={action} next="/products" />);
    const password = screen.getByLabelText("Mot de passe");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await userEvent.type(password, "secret");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(sent)).toEqual({ password: "secret", next: "/products" });
  });

  it("shows why the login failed", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { password: ["Mot de passe incorrect."] } });
    render(<LoginForm action={action} next="/" />);
    await userEvent.type(screen.getByLabelText("Mot de passe"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Mot de passe incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveFocus();
  });

  it("shows a lockout or configuration message", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {}, message: "Trop d'essais. Réessaie dans 15 min." });
    render(<LoginForm action={action} next="/" />);
    await userEvent.type(screen.getByLabelText("Mot de passe"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop d'essais. Réessaie dans 15 min.");
  });
});
```

In `src/components/layout/app-nav.test.tsx`, add after the `next/navigation` mock:

```tsx
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
```

and add this test inside the `describe`:

```tsx
  it("offers to log out from the sidebar", () => {
    render(<AppNav />);
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
  });
```

Run: `pnpm test src/lib/auth src/components`
Expected: FAIL — `decideAccess`, `isPublicPath`, `./login-form` and the logout button do not exist.

- [ ] **Step 2: Implement the access decision**

Append to `src/lib/auth/access.ts`:

```ts
const PUBLIC_FILES = new Set(["/login", "/icon.svg", "/apple-icon.png", "/favicon.ico"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_FILES.has(pathname) || pathname.startsWith("/_next/static/") || pathname === "/_next/image";
}

export type Access = { kind: "allow" } | { kind: "redirect"; location: string } | { kind: "unauthorized" };

export function decideAccess(input: { pathname: string; search: string; method: string; authenticated: boolean }): Access {
  const { pathname, search, method, authenticated } = input;
  const isRead = method === "GET" || method === "HEAD";
  if (isPublicPath(pathname)) {
    return pathname === "/login" && authenticated && isRead ? { kind: "redirect", location: "/" } : { kind: "allow" };
  }
  if (authenticated) return { kind: "allow" };
  if (pathname.startsWith("/uploads/") || !isRead) return { kind: "unauthorized" };
  return { kind: "redirect", location: `/login?next=${encodeURIComponent(pathname + search)}` };
}
```

- [ ] **Step 3: Add the proxy**

Create `src/proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { decideAccess } from "@/lib/auth/access";
import { isValidSessionToken, SESSION_COOKIE, sessionSigningKey } from "@/lib/auth/session-token";
import { getAuthEnv } from "@/lib/env";

/** Optimistic check on every request; actions and route handlers check again. */
export function proxy(request: NextRequest) {
  let authenticated = false;
  try {
    const env = getAuthEnv();
    authenticated = isValidSessionToken(
      request.cookies.get(SESSION_COOKIE)?.value,
      sessionSigningKey(env.SESSION_SECRET, env.APP_PASSWORD_HASH),
      Date.now(),
    );
  } catch {
    authenticated = false; // Missing configuration: fail closed.
  }

  const access = decideAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    authenticated,
  });
  if (access.kind === "redirect") return NextResponse.redirect(new URL(access.location, request.url));
  if (access.kind === "unauthorized") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
```

- [ ] **Step 4: Split the layouts and build the login page**

Move the app pages into a route group (URLs do not change):

```bash
mkdir -p "src/app/(app)" "src/app/(auth)/login"
git mv src/app/page.tsx "src/app/(app)/page.tsx"
git mv src/app/products "src/app/(app)/products"
git mv src/app/stores "src/app/(app)/stores"
git mv src/app/purchases "src/app/(app)/purchases"
```

In `src/app/layout.tsx`, remove the `AppNav` import and replace the `<body>` content with:

```tsx
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors theme="light" />
      </body>
```

Create `src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/app-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-24 lg:pr-8 lg:pb-10 lg:pl-[calc(15rem+2rem)]">
        {children}
      </main>
    </>
  );
}
```

Create `src/components/auth/login-form.tsx`:

```tsx
"use client";

import { FieldError } from "@/components/common/field-error";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";

type Props = {
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionResult<null>>;
  next: string;
};

export function LoginForm({ action, next }: Props) {
  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, () => {});

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 rounded-md border bg-card p-5">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" errors={errors.password} />
      </div>
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Se connecter</SubmitButton>
    </form>
  );
}
```

`loginAction` redirects on success, so the empty `onDone` is never reached with a result to handle.

Create `src/components/auth/logout-button.tsx`:

```tsx
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

/** A plain form post: works even before JavaScript has loaded. */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" className={cn("h-11 justify-start gap-3 text-muted-foreground", className)}>
        <LogOut className="size-[18px]" aria-hidden />
        Se déconnecter
      </Button>
    </form>
  );
}
```

Create `src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo-mark";
import { safeNextPath } from "@/lib/auth/access";
import { loginAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-center gap-3">
          <LogoMark className="size-12" />
          <h1 className="text-3xl">cabas</h1>
        </div>
        <LoginForm action={loginAction} next={safeNextPath(next)} />
      </div>
    </main>
  );
}
```

In `src/components/layout/app-nav.tsx`, import `LogoutButton` from `@/components/auth/logout-button` and add `<LogoutButton className="mt-auto" />` as the last child of the `<aside>` (after the `<nav aria-label="Menu">`). Because `AppNav` is a Client Component, pass the Server Action through the client boundary by importing `logoutAction` there: this is supported for Server Actions; `LogoutButton` has no `"use client"` and renders inside it as a client child.

In `src/app/(app)/page.tsx`, import `LogoutButton` and add `<LogoutButton className="justify-self-center lg:hidden" />` after the `EmptyState`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm test --project unit --project components`
Expected: PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass; the build output lists `ƒ Proxy (Middleware)`.

- [ ] **Step 6: Try it in the browser and commit**

Add to your local `.env` the values of Task 6 Step 2 (password hash and secret) and restart `pnpm dev`. Open `/products`: you land on `/login?next=%2Fproducts`; a wrong password shows the error; the right one returns to `/products`; "Se déconnecter" returns to `/login`; `/uploads/...` gives 401 when logged out.

```bash
git add -A src
git commit -m "feat(auth): add the login page, proxy check and logout"
```

---

### Task 6: Password tool, deployment and end-to-end login

**Files:**
- Create: `scripts/hash-password.ts`, `tests/e2e/credentials.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/auth.spec.ts`
- Modify: `package.json`, `tsconfig.json`, `.env.example`, `docker-compose.yml`, `scripts/e2e-server.sh`, `playwright.config.ts`, `.gitignore`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `hashPassword` (Task 1), the whole auth flow (Tasks 3–5).
- Produces: `pnpm hash-password` (asks twice, hidden input, prints the `APP_PASSWORD_HASH=` line); Compose passes `APP_PASSWORD_HASH`, `SESSION_SECRET`, `COOKIE_SECURE` to `app`; Playwright logs in once through a `setup` project and reuses the session; `auth.spec.ts` covers the login flow.

- [ ] **Step 1: Write the password tool**

In `tsconfig.json` `compilerOptions`, add `"allowImportingTsExtensions": true` (allowed because Next already sets `noEmit: true`), so the script can import the `.ts` module that Node runs directly.

Create `scripts/hash-password.ts`:

```ts
// Usage: pnpm hash-password — prints the APP_PASSWORD_HASH line for .env. Runs with Node's TypeScript support.
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/auth/password.ts";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Echo the prompt, hide the typed characters.
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    output._writeToOutput = (text) => {
      if (text.startsWith(question)) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await askHidden("Mot de passe : ");
if (password.length < 8) {
  console.error("Le mot de passe doit faire au moins 8 caractères.");
  process.exit(1);
}
if ((await askHidden("Confirme le mot de passe : ")) !== password) {
  console.error("Les deux mots de passe ne correspondent pas.");
  process.exit(1);
}
console.log(`APP_PASSWORD_HASH=${hashPassword(password)}`);
```

Add the script: `npm pkg set scripts.hash-password="node scripts/hash-password.ts"`.

Run: `pnpm hash-password` (type a test password twice)
Expected: one line `APP_PASSWORD_HASH=scrypt:16384:8:1:…:…`, and the password never appears on screen.

- [ ] **Step 2: Wire the configuration**

Append to `.env.example`:

```dotenv
# Authentication (see README): generate with `pnpm hash-password` and `openssl rand -base64 48`
APP_PASSWORD_HASH=
SESSION_SECRET=
# true only behind HTTPS (reverse proxy); NetBird over plain HTTP needs false
COOKIE_SECURE=false
```

In `docker-compose.yml`, add under `services.app.environment`:

```yaml
      APP_PASSWORD_HASH: ${APP_PASSWORD_HASH}
      SESSION_SECRET: ${SESSION_SECRET}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
```

For local development, run `pnpm hash-password` and `openssl rand -base64 48` and put both values in your `.env` (git-ignored), with a `# dev password: …` comment above them so you remember it.

- [ ] **Step 3: Log in once in the end-to-end tests**

Create `tests/e2e/credentials.ts`:

```ts
/** Password of the throwaway e2e server only (see scripts/e2e-server.sh). */
export const E2E_PASSWORD = "cabas-e2e-password";
export const AUTH_STATE = "tests/e2e/.auth/state.json";
```

In `scripts/e2e-server.sh`, before `pnpm build`, add:

```sh
export APP_PASSWORD_HASH="$(node --input-type=module -e "import { hashPassword } from './src/lib/auth/password.ts'; console.log(hashPassword(process.env.E2E_PASSWORD));")"
export SESSION_SECRET="$(openssl rand -base64 48)"
export COOKIE_SECURE=false
```

Replace `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE, E2E_PASSWORD } from "./tests/e2e/credentials";

export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", locale: "fr-FR", timezoneId: "Europe/Paris", trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], storageState: AUTH_STATE }, dependencies: ["setup"] },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "sh scripts/e2e-server.sh",
    url: "http://127.0.0.1:3100/login",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PASSWORD },
  },
});
```

Create `tests/e2e/auth.setup.ts`:

```ts
import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, E2E_PASSWORD } from "./credentials";

setup("log in once for the other tests", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: AUTH_STATE });
});
```

Create `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./credentials";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("asks for the password, then returns to the requested page", async ({ page }) => {
    await page.goto("/products?q=lait");
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts%3Fq%3Dlait$/);
    await page.getByLabel("Mot de passe").fill("wrong password");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
    await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/products\?q=lait$/);
  });

  test("does not serve photos or accept posts without a session", async ({ request }) => {
    expect((await request.get("/uploads/products/x.webp")).status()).toBe(401);
    expect((await request.post("/products", { data: "x" })).status()).toBe(401);
  });

  test("ignores a next parameter pointing outside the app", async ({ page }) => {
    await page.goto("/login?next=//example.com");
    await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
  });
});

test("logs out", async ({ page, browser }) => {
  // Use a separate login so the shared session of the other tests stays valid.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const own = await context.newPage();
  await own.goto("/login");
  await own.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await own.getByRole("button", { name: "Se connecter" }).click();
  await own.goto("/");
  await own.getByRole("button", { name: "Se déconnecter" }).first().click();
  await expect(own).toHaveURL(/\/login$/);
  await own.goto("/products");
  await expect(own).toHaveURL(/\/login\?next=%2Fproducts$/);
  await context.close();
  await expect(page).toBeTruthy();
});
```

`page.goto("/")` on mobile shows the home-page logout button; on desktop the sidebar one — `.first()` picks whichever is visible first in the DOM order. Logging out only deletes that context's cookie (the token is stateless), so the shared state of the other tests keeps working.

Add `tests/e2e/.auth/` to `.gitignore`.

- [ ] **Step 4: Document**

In `README.md`, add after the Deployment commands:

````markdown
### Password

The app asks for one password. Generate its hash and a session secret, then put both in `.env`:

```bash
pnpm hash-password            # prints APP_PASSWORD_HASH=…
openssl rand -base64 48       # use as SESSION_SECRET
```

Changing the password (new hash) or `SESSION_SECRET` logs every device out. Keep
`COOKIE_SECURE=false` while the app is served over plain HTTP through NetBird; set it to `true`
behind an HTTPS reverse proxy.
````

In `CLAUDE.md`, add to the Commands block: `pnpm hash-password       # generate APP_PASSWORD_HASH for .env`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all pass; Playwright lists the `setup` project, then `mobile` and `desktop` (auth, catalog, purchase specs).

```bash
git add -A
git commit -m "feat(auth): add the password tool, deployment settings and e2e login"
```

---

### Task 7: Security headers

**Files:**
- Create: `src/lib/security-headers.ts`
- Modify: `next.config.ts`, `tests/e2e/auth.spec.ts`
- Test: `src/lib/security-headers.test.ts`

**Interfaces:**
- Produces: `securityHeaders(options: { production: boolean }): { key: string; value: string }[]` applied to every route by `next.config.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/security-headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const header = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe("securityHeaders", () => {
  it("forbids framing, sniffing and leaking the referrer to other sites", () => {
    const headers = securityHeaders({ production: true });
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
    expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(headers, "Referrer-Policy")).toBe("same-origin");
    expect(header(headers, "Permissions-Policy")).toContain("geolocation=()");
  });

  it("only allows the app's own resources", () => {
    const csp = header(securityHeaders({ production: true }), "Content-Security-Policy") ?? "";
    for (const directive of [
      "default-src 'self'",
      "img-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows what the development server needs", () => {
    const csp = header(securityHeaders({ production: false }), "Content-Security-Policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });
});
```

Append to `tests/e2e/auth.spec.ts`:

```ts
test("sends security headers", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
```

Run: `pnpm test src/lib/security-headers.test.ts`
Expected: FAIL — `./security-headers` not found.

- [ ] **Step 2: Implement**

Create `src/lib/security-headers.ts`:

```ts
/**
 * Same-origin only. 'unsafe-inline' stays for scripts and styles because Next.js injects inline
 * hydration scripts; the app loads no third-party script and React escapes rendered values.
 */
export function securityHeaders({ production }: { production: boolean }): { key: string; value: string }[] {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${production ? "" : " ws:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
}
```

`camera=()` does not affect photo capture: the file input opens the system camera app, which needs no Permissions-Policy.

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Phone photos are 2-6 MB; the upload limit itself (10 MB) is enforced in saveImage.
    serverActions: { bodySizeLimit: "11mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ production: process.env.NODE_ENV === "production" }) }];
  },
};

export default nextConfig;
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm test src/lib/security-headers.test.ts` — Expected: PASS.
Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` — Expected: all pass. Open the app in the browser with the console open: no CSP violation on the pages, the product photos or the receipt preview (blob:).

```bash
git add -A
git commit -m "feat(security): send a content security policy and hardening headers"
```

---

## Completion checklist

- [ ] All 7 tasks committed on `feat/auth`; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green; `docker build` OK.
- [ ] Security review of the whole app (`/security-review` style: auth, uploads, input validation, headers, dependencies with `pnpm audit`, Docker); Critical/Important findings fixed test-first.
- [ ] Pull request against `main` explaining how to set `APP_PASSWORD_HASH` and `SESSION_SECRET` before deploying.
