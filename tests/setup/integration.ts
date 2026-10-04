import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, inject, vi } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "cabas-uploads-"));

const { hashPassword } = await import("@/lib/auth/password");
process.env.APP_PASSWORD_HASH = hashPassword("test-password");
process.env.SESSION_SECRET = "integration-test-session-secret-0123456789";
process.env.COOKIE_SECURE = "false";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", async () => {
  const { cookieJar, requestHeaders } = await import("./cookie-jar");
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
    headers: async () => requestHeaders,
  };
});

const { db } = await import("@/server/db");
const { cookieJar, requestHeaders } = await import("./cookie-jar");
const { createSessionToken, sessionSigningKey, SESSION_COOKIE } = await import("@/lib/auth/session-token");
const { loginLimiter } = await import("@/server/auth/login-limiter");

beforeEach(async () => {
  // Every test starts signed in; tests about authentication clear the jar themselves.
  cookieJar.clear();
  const key = sessionSigningKey(process.env.SESSION_SECRET as string, process.env.APP_PASSWORD_HASH as string);
  cookieJar.set(SESSION_COOKIE, { value: createSessionToken(Date.now() + 3_600_000, key), options: {} });
  loginLimiter.reset();
  for (const name of [...requestHeaders.keys()]) requestHeaders.delete(name);
  requestHeaders.set("x-forwarded-for", "203.0.113.7");
  await db().$executeRawUnsafe(`
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables
               WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE format('TRUNCATE TABLE %I CASCADE', t.tablename);
      END LOOP;
    END $$;
  `);
});

afterAll(async () => {
  await db().$disconnect();
});
