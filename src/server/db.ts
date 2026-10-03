import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { cabasPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.cabasPrisma) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      connectionTimeoutMillis: 5_000,
      max: 10,
    });
    globalForPrisma.cabasPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.cabasPrisma;
}
