import "server-only";
import { cheapestStorePrice, latestPricesByStore } from "@/domain/latest-prices";
import type { SizeUnit } from "@/domain/types";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";

export type ProductSummary = {
  id: string;
  name: string;
  brand: string | null;
  photoPath: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
  bestPriceCents: number | null;
};

export type ProductInput = {
  name: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
  photoPath: string | null;
};

export const withPrices = {
  id: true,
  name: true,
  brand: true,
  photoPath: true,
  sizeValue: true,
  sizeUnit: true,
  prices: { select: { storeId: true, priceCents: true, observedAt: true, createdAt: true } },
} as const;

type Row = Omit<ProductSummary, "bestPriceCents"> & {
  prices: { storeId: string; priceCents: number; observedAt: Date; createdAt: Date }[];
};

export function toSummary({ prices, ...product }: Row): ProductSummary {
  return { ...product, bestPriceCents: cheapestStorePrice(latestPricesByStore(prices))?.priceCents ?? null };
}

export async function listProducts(query?: string): Promise<ProductSummary[]> {
  const q = query?.trim();
  const rows = await db().product.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] }
      : undefined,
    select: withPrices,
    orderBy: { name: "asc" },
  });
  return rows.map(toSummary);
}

export async function getProduct(id: string): Promise<ProductSummary | null> {
  if (!isUuid(id)) return null;
  const row = await db().product.findUnique({ where: { id }, select: withPrices });
  return row ? toSummary(row) : null;
}

export async function createProduct(input: ProductInput): Promise<ProductSummary> {
  return toSummary(await db().product.create({ data: input, select: withPrices }));
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductSummary> {
  return toSummary(await db().product.update({ where: { id }, data: input, select: withPrices }));
}

export async function deleteProduct(id: string): Promise<ProductSummary> {
  return toSummary(await db().product.delete({ where: { id }, select: withPrices }));
}
