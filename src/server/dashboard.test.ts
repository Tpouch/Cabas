import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { loadDashboard } from "./dashboard";
import { createPurchase } from "./repositories/purchases";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const auchan = await db().store.create({ data: { name: "Auchan", nameKey: "auchan" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const rice = await db().product.create({ data: { name: "Riz", sizeValue: 1000, sizeUnit: "G" } });
  return { lidl, auchan, penne, rice };
}

describe("loadDashboard", () => {
  it("gathers the indicators, rankings and savings of the month", async () => {
    const { lidl, auchan, penne, rice } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-09-20"),
      totalCents: 300,
      receiptPath: null,
      lines: [{ productId: rice.id, quantity: 1, unitPriceCents: 300 }],
    });
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: auchan.id, priceCents: 130, observedAt: day("2026-10-01"), source: "MANUAL" },
    });
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-10"),
      totalCents: 140,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 2, unitPriceCents: 100, promo: { kind: "PERCENT_OFF", percent: 30 } }],
    });
    await createPurchase({
      storeId: auchan.id,
      purchasedAt: day("2026-10-31"),
      totalCents: 250,
      receiptPath: null,
      lines: [{ productId: rice.id, quantity: 1, unitPriceCents: 250 }],
    });

    const dashboard = await loadDashboard("2026-10");

    expect(dashboard).toMatchObject({
      month: "2026-10",
      previousMonth: "2026-09",
      purchaseCount: 2,
      totalCents: 390,
      changePercent: 30,
      averageBasketCents: 195,
      promotionSavingsCents: 60,
      // Penne: Auchan 1,30 € vs 1,00 € paid × 2 = 60. Riz: Lidl's 3,00 € from September vs 2,50 € paid = 50.
      priceSavingsCents: 110,
    });
    expect(dashboard.topBySpend.map((p) => [p.productName, p.spendCents])).toEqual([
      ["Riz", 250],
      ["Penne", 140],
    ]);
    expect(dashboard.topByQuantity.map((p) => [p.productName, p.quantity])).toEqual([
      ["Penne", 2],
      ["Riz", 1],
    ]);
    expect(dashboard.stores.map((s) => [s.storeName, s.totalCents])).toEqual([
      ["Auchan", 250],
      ["Lidl", 140],
    ]);
    expect(dashboard.months).toHaveLength(12);
    expect(dashboard.months.slice(-2)).toEqual([
      { month: "2026-09", totalCents: 300 },
      { month: "2026-10", totalCents: 390 },
    ]);
    expect(dashboard.months[0]).toEqual({ month: "2025-11", totalCents: 0 });
  });

  it("describes an empty month with no change and 12 empty months", async () => {
    const dashboard = await loadDashboard("2026-10");
    expect(dashboard).toMatchObject({ purchaseCount: 0, totalCents: 0, changePercent: null, averageBasketCents: 0 });
    expect(dashboard.months.every((m) => m.totalCents === 0)).toBe(true);
    expect(dashboard.topBySpend).toEqual([]);
    expect(dashboard.stores).toEqual([]);
  });
});
