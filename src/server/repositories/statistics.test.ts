import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createPurchase } from "./purchases";
import { listObservationsForProducts, listPurchasesForStats, monthlyTotals } from "./statistics";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  const buy = (iso: string, totalCents: number, productId = penne.id) =>
    createPurchase({
      storeId: lidl.id,
      purchasedAt: day(iso),
      totalCents,
      receiptPath: null,
      lines: [{ productId, quantity: 1, unitPriceCents: totalCents }],
    });
  return { lidl, penne, apples, buy };
}

describe("listPurchasesForStats", () => {
  it("keeps the purchases from the first to the last day of the range", async () => {
    const { buy } = await setup();
    await buy("2026-09-30", 1);
    await buy("2026-10-01", 2);
    await buy("2026-10-31", 3);
    await buy("2026-11-01", 4);
    const purchases = await listPurchasesForStats(day("2026-10-01"), day("2026-11-01"));
    expect(purchases.map((p) => p.totalCents)).toEqual([2, 3]);
  });

  it("gives the store, the product names, decimal quantities and promotions", async () => {
    const { lidl, penne, apples } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-10"),
      totalCents: 439,
      receiptPath: null,
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99, promo: { kind: "BUY_GET_FREE", buy: 1, free: 1 } },
        { productId: apples.id, quantity: 1.5, unitPriceCents: 249 },
      ],
    });
    const [purchase] = await listPurchasesForStats(day("2026-10-01"), day("2026-11-01"));
    expect(purchase).toMatchObject({ storeId: lidl.id, storeName: "Lidl", totalCents: 439 });
    expect(purchase?.purchasedAt.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(purchase?.lines).toEqual(
      expect.arrayContaining([
        { productId: penne.id, productName: "Penne", quantity: 2, unitPriceCents: 99, promo: { kind: "BUY_GET_FREE", buy: 1, free: 1 } },
        { productId: apples.id, productName: "Pommes", quantity: 1.5, unitPriceCents: 249, promo: null },
      ]),
    );
  });
});

describe("monthlyTotals", () => {
  it("adds up the totals paid per calendar month inside the range", async () => {
    const { buy } = await setup();
    await buy("2026-08-31", 1000);
    await buy("2026-09-01", 200);
    await buy("2026-09-30", 300);
    await buy("2026-10-31", 400);
    await buy("2026-11-01", 5000);
    expect(await monthlyTotals(day("2026-09-01"), day("2026-11-01"))).toEqual([
      { month: "2026-09", totalCents: 500 },
      { month: "2026-10", totalCents: 400 },
    ]);
  });
});

describe("listObservationsForProducts", () => {
  it("returns the prices of the given products observed before the end of the range", async () => {
    const { lidl, penne, apples, buy } = await setup();
    await buy("2026-10-10", 99);
    await buy("2026-10-12", 249, apples.id);
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: lidl.id, priceCents: 120, observedAt: day("2026-11-01"), source: "MANUAL" },
    });
    const observations = await listObservationsForProducts([penne.id], day("2026-11-01"));
    expect(observations.map((o) => [o.productId, o.storeId, o.priceCents, o.observedAt.toISOString()])).toEqual([
      [penne.id, lidl.id, 99, "2026-10-10T00:00:00.000Z"],
    ]);
    expect(observations[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("returns nothing for no product", async () => {
    expect(await listObservationsForProducts([], day("2026-11-01"))).toEqual([]);
  });
});
