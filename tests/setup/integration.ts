import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, inject, vi } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "cabas-uploads-"));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db } = await import("@/server/db");

beforeEach(async () => {
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
