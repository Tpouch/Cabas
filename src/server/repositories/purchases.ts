import "server-only";
import type { Promo, PromoKind } from "@/domain/promo";
import type { PurchaseLine } from "@/domain/purchase";
import type { SizeUnit } from "@/domain/types";
import { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";
import type { StoreSummary } from "./stores";

export class PurchaseNotFoundError extends Error {}
/** A store or product used by the purchase was deleted meanwhile. */
export class UnknownReferenceError extends Error {}

export type PurchaseInput = {
  storeId: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  lines: PurchaseLine[];
};

export type PurchaseListItem = {
  id: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  itemCount: number;
  store: StoreSummary;
};

export type PurchaseItemDetail = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  promo: Promo | null;
  product: {
    id: string;
    name: string;
    brand: string | null;
    photoPath: string | null;
    sizeValue: number;
    sizeUnit: SizeUnit;
  };
};

export type PurchaseDetail = {
  id: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  store: StoreSummary;
  items: PurchaseItemDetail[];
};

export type PriceIndex = Record<string, Record<string, number>>;

const storeSummary = { select: { id: true, name: true, address: true, logoPath: true } } as const;

type PromoColumns = {
  promoKind: PromoKind | null;
  promoAmountCents: number | null;
  promoPercent: number | null;
  promoNth: number | null;
  promoBuy: number | null;
  promoFree: number | null;
};

const NO_PROMO: PromoColumns = {
  promoKind: null,
  promoAmountCents: null,
  promoPercent: null,
  promoNth: null,
  promoBuy: null,
  promoFree: null,
};

function promoColumns(promo: Promo | null | undefined): PromoColumns {
  if (!promo) return NO_PROMO;
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { ...NO_PROMO, promoKind: promo.kind, promoAmountCents: promo.amountCents };
    case "PERCENT_OFF":
      return { ...NO_PROMO, promoKind: promo.kind, promoPercent: promo.percent };
    case "NTH_PERCENT_OFF":
      return { ...NO_PROMO, promoKind: promo.kind, promoNth: promo.nth, promoPercent: promo.percent };
    case "BUY_GET_FREE":
      return { ...NO_PROMO, promoKind: promo.kind, promoBuy: promo.buy, promoFree: promo.free };
  }
}

/** The CHECK constraint guarantees the parameters of the stored kind are set. */
function required(value: number | null): number {
  if (value === null) throw new Error("Inconsistent promotion columns");
  return value;
}

function promoFromColumns(row: PromoColumns): Promo | null {
  switch (row.promoKind) {
    case null:
      return null;
    case "AMOUNT_OFF_PER_UNIT":
      return { kind: row.promoKind, amountCents: required(row.promoAmountCents) };
    case "PERCENT_OFF":
      return { kind: row.promoKind, percent: required(row.promoPercent) };
    case "NTH_PERCENT_OFF":
      return { kind: row.promoKind, nth: required(row.promoNth), percent: required(row.promoPercent) };
    case "BUY_GET_FREE":
      return { kind: row.promoKind, buy: required(row.promoBuy), free: required(row.promoFree) };
  }
}

const itemSelect = {
  id: true,
  quantity: true,
  unitPriceCents: true,
  promoKind: true,
  promoAmountCents: true,
  promoPercent: true,
  promoNth: true,
  promoBuy: true,
  promoFree: true,
  product: { select: { id: true, name: true, brand: true, photoPath: true, sizeValue: true, sizeUnit: true } },
} as const satisfies Prisma.PurchaseItemSelect;

type ItemRow = Prisma.PurchaseItemGetPayload<{ select: typeof itemSelect }>;

function toItemDetail({ id, quantity, unitPriceCents, product, ...columns }: ItemRow): PurchaseItemDetail {
  return { id, quantity: quantity.toNumber(), unitPriceCents, product, promo: promoFromColumns(columns) };
}

/** Each line owns the purchase price observation written with it. */
function itemsCreate(input: PurchaseInput) {
  return {
    create: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      ...promoColumns(line.promo),
      priceObservation: {
        create: {
          productId: line.productId,
          storeId: input.storeId,
          priceCents: line.unitPriceCents,
          observedAt: input.purchasedAt,
          source: "PURCHASE" as const,
        },
      },
    })),
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function createPurchase(input: PurchaseInput): Promise<{ id: string }> {
  try {
    return await db().purchase.create({
      data: {
        storeId: input.storeId,
        purchasedAt: input.purchasedAt,
        totalCents: input.totalCents,
        receiptPath: input.receiptPath,
        items: itemsCreate(input),
      },
      select: { id: true },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new UnknownReferenceError();
    throw error;
  }
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<{ previousReceiptPath: string | null }> {
  if (!isUuid(id)) throw new PurchaseNotFoundError();
  try {
    return await db().$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id }, select: { receiptPath: true } });
      if (!existing) throw new PurchaseNotFoundError();
      // Deleting the lines also deletes their price observations (cascade).
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.update({
        where: { id },
        data: {
          storeId: input.storeId,
          purchasedAt: input.purchasedAt,
          totalCents: input.totalCents,
          receiptPath: input.receiptPath ?? existing.receiptPath,
          items: itemsCreate(input),
        },
      });
      return { previousReceiptPath: existing.receiptPath };
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new UnknownReferenceError();
    throw error;
  }
}

export async function deletePurchase(id: string): Promise<{ receiptPath: string | null }> {
  if (!isUuid(id)) throw new PurchaseNotFoundError();
  try {
    return await db().purchase.delete({ where: { id }, select: { receiptPath: true } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) throw new PurchaseNotFoundError();
    throw error;
  }
}

export async function listPurchases(): Promise<PurchaseListItem[]> {
  const rows = await db().purchase.findMany({
    select: {
      id: true,
      purchasedAt: true,
      totalCents: true,
      receiptPath: true,
      store: storeSummary,
      _count: { select: { items: true } },
    },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(({ _count, ...purchase }) => ({ ...purchase, itemCount: _count.items }));
}

export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  if (!isUuid(id)) return null;
  const row = await db().purchase.findUnique({
    where: { id },
    select: {
      id: true,
      purchasedAt: true,
      totalCents: true,
      receiptPath: true,
      store: storeSummary,
      items: { select: itemSelect, orderBy: { id: "asc" } },
    },
  });
  if (!row) return null;
  return { ...row, items: row.items.map(toItemDetail) };
}

export async function latestPriceIndex(): Promise<PriceIndex> {
  const rows = await db().priceObservation.findMany({
    select: { productId: true, storeId: true, priceCents: true },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
  });
  const index: PriceIndex = {};
  for (const row of rows) {
    const byProduct = (index[row.storeId] ??= {});
    byProduct[row.productId] ??= row.priceCents;
  }
  return index;
}
