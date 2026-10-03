import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";
import { ProductNotFoundError, type ProductSummary, toSummary, withPrices } from "./products";

export class SelfAlternativeError extends Error {}

function orderedPair(a: string, b: string): { productAId: string; productBId: string } {
  return a < b ? { productAId: a, productBId: b } : { productAId: b, productBId: a };
}

export async function listAlternatives(productId: string): Promise<ProductSummary[]> {
  if (!isUuid(productId)) return [];
  const links = await db().productAlternative.findMany({
    where: { OR: [{ productAId: productId }, { productBId: productId }] },
    select: { productA: { select: withPrices }, productB: { select: withPrices } },
  });
  return links.map((link) => toSummary(link.productA.id === productId ? link.productB : link.productA));
}

export async function linkAlternative(productId: string, otherId: string): Promise<void> {
  if (!isUuid(productId) || !isUuid(otherId)) throw new ProductNotFoundError();
  if (productId === otherId) throw new SelfAlternativeError();
  const pair = orderedPair(productId, otherId);
  try {
    await db().productAlternative.upsert({ where: { productAId_productBId: pair }, create: pair, update: {} });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    if (error.code === "P2003") throw new ProductNotFoundError();
    // P2002: a concurrent request (double tap) created the same pair; the link exists, which is what we want.
    if (error.code !== "P2002") throw error;
  }
}

export async function unlinkAlternative(productId: string, otherId: string): Promise<void> {
  await db().productAlternative.deleteMany({ where: orderedPair(productId, otherId) });
}
