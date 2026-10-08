import { describe, expect, it } from "vitest";
import type { Promo } from "@/domain/promo";
import { deleteProductAction } from "@/server/actions/products";
import { deleteStoreAction } from "@/server/actions/stores";
import { db } from "@/server/db";
import { listStorePrices } from "./prices";
import {
  createPurchase,
  deletePurchase,
  getPurchase,
  latestPriceIndex,
  listPurchases,
  PurchaseNotFoundError,
  UnknownReferenceError,
  updatePurchase,
} from "./purchases";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const auchan = await db().store.create({ data: { name: "Auchan", nameKey: "auchan" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  return { lidl, auchan, penne, apples };
}

describe("purchase storage", () => {
  it("saves a purchase, its lines and one purchase price per line", async () => {
    const { lidl, penne, apples } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 497,
      receiptPath: null,
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99 },
        { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
      ],
    });

    const purchase = await getPurchase(id);
    expect(purchase).toMatchObject({ totalCents: 497, store: { name: "Lidl" } });
    expect(purchase?.purchasedAt.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(purchase?.items.map((i) => [i.product.name, i.quantity, i.unitPriceCents])).toEqual([
      ["Penne", 2, 99],
      ["Pommes", 1.2, 249],
    ]);
    const observations = await db().priceObservation.findMany({ orderBy: { priceCents: "asc" } });
    expect(observations.map((o) => [o.storeId, o.priceCents, o.source, o.observedAt.toISOString()])).toEqual([
      [lidl.id, 99, "PURCHASE", "2026-10-03T00:00:00.000Z"],
      [lidl.id, 249, "PURCHASE", "2026-10-03T00:00:00.000Z"],
    ]);
  });

  it("writes nothing when a product no longer exists", async () => {
    const { lidl, penne } = await setup();
    await expect(
      createPurchase({
        storeId: lidl.id,
        purchasedAt: day("2026-10-03"),
        totalCents: 99,
        receiptPath: null,
        lines: [
          { productId: penne.id, quantity: 1, unitPriceCents: 99 },
          { productId: "01999999-0000-7000-8000-000000000000", quantity: 1, unitPriceCents: 10 },
        ],
      }),
    ).rejects.toThrow(UnknownReferenceError);
    expect(await db().purchase.count()).toBe(0);
    expect(await db().priceObservation.count()).toBe(0);
  });

  it("lists purchases newest first with their store and item count", async () => {
    const { lidl, auchan, penne } = await setup();
    const line = { productId: penne.id, quantity: 1, unitPriceCents: 99 };
    await createPurchase({ storeId: lidl.id, purchasedAt: day("2026-09-30"), totalCents: 99, receiptPath: null, lines: [line] });
    await createPurchase({ storeId: auchan.id, purchasedAt: day("2026-10-02"), totalCents: 198, receiptPath: null, lines: [line, line] });
    const list = await listPurchases();
    expect(list.map((p) => [p.store.name, p.itemCount, p.totalCents])).toEqual([
      ["Auchan", 2, 198],
      ["Lidl", 1, 99],
    ]);
  });

  it("replaces lines and their prices when a purchase is edited", async () => {
    const { lidl, auchan, penne, apples } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 497,
      receiptPath: "receipts/old.webp",
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99 },
        { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
      ],
    });

    const result = await updatePurchase(id, {
      storeId: auchan.id,
      purchasedAt: day("2026-10-02"),
      totalCents: 95,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 95 }],
    });

    expect(result).toEqual({ previousReceiptPath: "receipts/old.webp" });
    const purchase = await getPurchase(id);
    expect(purchase).toMatchObject({ totalCents: 95, receiptPath: "receipts/old.webp", store: { name: "Auchan" } });
    expect(purchase?.items).toHaveLength(1);
    expect((await listStorePrices(penne.id)).map((r) => [r.store.name, r.priceCents])).toEqual([["Auchan", 95]]);
    expect(await listStorePrices(apples.id)).toEqual([]);
  });

  it("deletes a purchase with its lines and prices", async () => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: "receipts/r.webp",
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deletePurchase(id)).toEqual({ receiptPath: "receipts/r.webp" });
    expect(await getPurchase(id)).toBeNull();
    expect(await db().purchaseItem.count()).toBe(0);
    expect(await listStorePrices(penne.id)).toEqual([]);
  });

  it("reports a purchase that no longer exists", async () => {
    await expect(deletePurchase("01999999-0000-7000-8000-000000000000")).rejects.toThrow(PurchaseNotFoundError);
    await expect(deletePurchase("abc")).rejects.toThrow(PurchaseNotFoundError);
    expect(await getPurchase("abc")).toBeNull();
  });

  it("indexes the current price of each product in each store", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-09-01"),
      totalCents: 89,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 89 }],
    });
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: lidl.id, priceCents: 99, observedAt: day("2026-10-01"), source: "MANUAL" },
    });
    expect(await latestPriceIndex()).toEqual({ [lidl.id]: { [penne.id]: 99 } });
  });
});

describe("records used by purchases", () => {
  it("refuses to delete a product that appears in a purchase", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deleteProductAction(penne.id)).toMatchObject({
      ok: false,
      message: "Ce produit apparaît dans des courses : il ne peut pas être supprimé.",
    });
    expect(await db().product.count({ where: { id: penne.id } })).toBe(1);
    expect(await db().priceObservation.count()).toBe(1);
  });

  it("refuses to delete a store that has purchases", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deleteStoreAction(lidl.id)).toMatchObject({ ok: false, message: expect.stringContaining("ne peut pas être supprimé") });
  });
});

describe("promotions on purchase lines", () => {
  const promos: Promo[] = [
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 20 },
    { kind: "PERCENT_OFF", percent: 30 },
    { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 },
    { kind: "BUY_GET_FREE", buy: 2, free: 1 },
  ];

  it.each(promos)("keeps the promotion %j and the regular price", async (promo) => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 240,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 3, unitPriceCents: 120, promo }],
    });
    expect((await getPurchase(id))?.items[0]?.promo).toEqual(promo);
    expect((await db().priceObservation.findFirstOrThrow()).priceCents).toBe(120);
  });

  it("reads a line without a promotion as null", async () => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect((await getPurchase(id))?.items[0]?.promo).toBeNull();
  });

  it("replaces or removes promotions when a purchase is edited", async () => {
    const { lidl, penne, apples } = await setup();
    const base = { storeId: lidl.id, purchasedAt: day("2026-10-03"), totalCents: 240, receiptPath: null };
    const { id } = await createPurchase({
      ...base,
      lines: [
        { productId: penne.id, quantity: 3, unitPriceCents: 120, promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } },
        { productId: apples.id, quantity: 1, unitPriceCents: 249, promo: { kind: "PERCENT_OFF", percent: 30 } },
      ],
    });
    await updatePurchase(id, {
      ...base,
      lines: [
        { productId: penne.id, quantity: 3, unitPriceCents: 120, promo: { kind: "PERCENT_OFF", percent: 10 } },
        { productId: apples.id, quantity: 1, unitPriceCents: 249 },
      ],
    });
    const items = (await getPurchase(id))?.items ?? [];
    expect(items.map((item) => [item.product.name, item.promo])).toEqual([
      ["Penne", { kind: "PERCENT_OFF", percent: 10 }],
      ["Pommes", null],
    ]);
    expect((await listStorePrices(penne.id)).map((r) => r.priceCents)).toEqual([120]);
  });

  it.each([
    ["a kind without its parameter", { promoKind: "PERCENT_OFF" as const }],
    ["a parameter of another kind", { promoKind: "PERCENT_OFF" as const, promoPercent: 30, promoBuy: 2 }],
    ["a parameter without a kind", { promoPercent: 30 }],
    ["an out-of-range value", { promoKind: "NTH_PERCENT_OFF" as const, promoNth: 1, promoPercent: 60 }],
  ])("refuses %s in the database", async (_, columns) => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    const item = await db().purchaseItem.findFirstOrThrow({ where: { purchaseId: id } });
    await expect(db().purchaseItem.update({ where: { id: item.id }, data: columns })).rejects.toThrow();
  });
});
