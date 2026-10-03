import "server-only";
import { latestPricesByStore } from "@/domain/latest-prices";
import { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";
import type { StoreSummary } from "./stores";

export type StorePriceRow = { store: StoreSummary; priceCents: number; observedAt: Date; isCheapest: boolean };

export class UnknownStoreError extends Error {}

export async function listStorePrices(productId: string): Promise<StorePriceRow[]> {
  if (!isUuid(productId)) return [];
  const observations = await db().priceObservation.findMany({
    where: { productId },
    select: {
      storeId: true,
      priceCents: true,
      observedAt: true,
      createdAt: true,
      store: { select: { id: true, name: true, address: true, logoPath: true } },
    },
  });
  const stores = new Map(observations.map((o) => [o.storeId, o.store]));
  return latestPricesByStore(observations).map((price, index) => ({
    store: stores.get(price.storeId) as StoreSummary,
    priceCents: price.priceCents,
    observedAt: price.observedAt,
    isCheapest: index === 0,
  }));
}

export async function addManualPrice(input: {
  productId: string;
  storeId: string;
  priceCents: number;
  observedAt: Date;
}): Promise<void> {
  try {
    await db().priceObservation.create({ data: { ...input, source: "MANUAL" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new UnknownStoreError();
    throw error;
  }
}
