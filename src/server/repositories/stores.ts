import "server-only";
import { normalizeStoreName } from "@/domain/store-name";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type StoreSummary = { id: string; name: string; address: string | null; logoPath: string | null };
type StoreInput = { name: string; address: string | null; logoPath: string | null };

export class DuplicateStoreError extends Error {}
export class StoreInUseError extends Error {}

const summary = { id: true, name: true, address: true, logoPath: true } as const;

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function listStores(): Promise<StoreSummary[]> {
  return db().store.findMany({ select: summary, orderBy: { name: "asc" } });
}

export async function getStore(id: string): Promise<StoreSummary | null> {
  return db().store.findUnique({ where: { id }, select: summary });
}

export async function createStore(input: StoreInput): Promise<StoreSummary> {
  try {
    return await db().store.create({ data: { ...input, nameKey: normalizeStoreName(input.name) }, select: summary });
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new DuplicateStoreError();
    throw error;
  }
}

export async function updateStore(id: string, input: StoreInput): Promise<StoreSummary> {
  try {
    return await db().store.update({
      where: { id },
      data: { ...input, nameKey: normalizeStoreName(input.name) },
      select: summary,
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new DuplicateStoreError();
    throw error;
  }
}

export async function deleteStore(id: string): Promise<StoreSummary> {
  try {
    return await db().store.delete({ where: { id }, select: summary });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new StoreInUseError();
    throw error;
  }
}
