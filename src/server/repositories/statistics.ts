import "server-only";
import type { MonthTotal, ProductObservation, StatPurchase } from "@/domain/statistics";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { promoFromColumns } from "./purchases";

const lineSelect = {
  productId: true,
  quantity: true,
  unitPriceCents: true,
  promoKind: true,
  promoAmountCents: true,
  promoPercent: true,
  promoNth: true,
  promoBuy: true,
  promoFree: true,
  product: { select: { name: true } },
} as const satisfies Prisma.PurchaseItemSelect;

export async function listPurchasesForStats(start: Date, end: Date): Promise<StatPurchase[]> {
  const rows = await db().purchase.findMany({
    where: { purchasedAt: { gte: start, lt: end } },
    select: {
      purchasedAt: true,
      totalCents: true,
      store: { select: { id: true, name: true } },
      items: { select: lineSelect, orderBy: { id: "asc" } },
    },
    orderBy: [{ purchasedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(({ purchasedAt, totalCents, store, items }) => ({
    purchasedAt,
    totalCents,
    storeId: store.id,
    storeName: store.name,
    lines: items.map(({ productId, quantity, unitPriceCents, product, ...columns }) => ({
      productId,
      productName: product.name,
      quantity: quantity.toNumber(),
      unitPriceCents,
      promo: promoFromColumns(columns),
    })),
  }));
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function monthlyTotals(start: Date, end: Date): Promise<MonthTotal[]> {
  // Bounds are sent as plain dates: a timestamptz parameter would be compared in the
  // database session's time zone and shift the month edges.
  const rows = await db().$queryRaw<{ month: string; total: bigint }[]>`
    SELECT to_char(purchased_at, 'YYYY-MM') AS month, SUM(total_cents) AS total
    FROM purchases
    WHERE purchased_at >= ${isoDay(start)}::date AND purchased_at < ${isoDay(end)}::date
    GROUP BY 1
    ORDER BY 1`;
  return rows.map((row) => ({ month: row.month, totalCents: Number(row.total) }));
}

export async function listObservationsForProducts(productIds: string[], until: Date): Promise<ProductObservation[]> {
  if (productIds.length === 0) return [];
  return db().priceObservation.findMany({
    where: { productId: { in: productIds }, observedAt: { lt: until } },
    select: { productId: true, storeId: true, priceCents: true, observedAt: true, createdAt: true },
  });
}
