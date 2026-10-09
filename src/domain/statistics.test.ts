import { describe, expect, it } from "vitest";
import {
  averageBasket,
  changeVsPrevious,
  fillMonths,
  type ProductObservation,
  promotionSavings,
  savingsVsHighestPrice,
  spendPerStore,
  type StatLine,
  type StatPurchase,
  topProducts,
  totalSpent,
} from "./statistics";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function line(overrides: Partial<StatLine> = {}): StatLine {
  return { productId: "penne", productName: "Penne", quantity: 1, unitPriceCents: 100, promo: null, ...overrides };
}

function purchase(overrides: Partial<StatPurchase> = {}): StatPurchase {
  return { purchasedAt: day("2026-10-10"), storeId: "lidl", storeName: "Lidl", totalCents: 100, lines: [line()], ...overrides };
}

describe("totalSpent", () => {
  it("adds up the totals paid", () => {
    expect(totalSpent([purchase({ totalCents: 4862 }), purchase({ totalCents: 2790 })])).toBe(7652);
  });

  it("is 0 without purchases", () => {
    expect(totalSpent([])).toBe(0);
  });
});

describe("changeVsPrevious", () => {
  it("is the rise in percent", () => {
    expect(changeVsPrevious(5500, 5000)).toBe(10);
  });

  it("is the drop in percent, rounded to the nearest percent", () => {
    expect(changeVsPrevious(1000, 3000)).toBe(-67);
  });

  it("is null when the previous month has nothing to compare with", () => {
    expect(changeVsPrevious(5000, 0)).toBeNull();
  });
});

describe("averageBasket", () => {
  it("divides the total by the purchase count, rounded half up", () => {
    expect(averageBasket(10000, 3)).toBe(3333);
    expect(averageBasket(5, 2)).toBe(3);
  });

  it("is 0 without purchases", () => {
    expect(averageBasket(0, 0)).toBe(0);
  });
});

describe("promotionSavings", () => {
  it("adds up the promotion discounts of every line", () => {
    const purchases = [
      purchase({ lines: [line({ quantity: 2, promo: { kind: "PERCENT_OFF", percent: 30 } }), line()] }),
      purchase({ lines: [line({ quantity: 3, unitPriceCents: 149, promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } })] }),
    ];
    expect(promotionSavings(purchases)).toBe(60 + 149);
  });

  it("is 0 when no line has a promotion", () => {
    expect(promotionSavings([purchase()])).toBe(0);
  });
});

describe("fillMonths", () => {
  it("gives every month a total, 0 when it had no purchases", () => {
    expect(fillMonths(["2026-08", "2026-09", "2026-10"], [{ month: "2026-09", totalCents: 500 }])).toEqual([
      { month: "2026-08", totalCents: 0 },
      { month: "2026-09", totalCents: 500 },
      { month: "2026-10", totalCents: 0 },
    ]);
  });

  it("ignores totals outside the months", () => {
    expect(fillMonths(["2026-10"], [{ month: "2025-10", totalCents: 500 }])).toEqual([{ month: "2026-10", totalCents: 0 }]);
  });
});

describe("topProducts", () => {
  it("ranks products by net spend, after promotions", () => {
    const purchases = [
      purchase({
        lines: [
          line({ productId: "penne", productName: "Penne", quantity: 2, promo: { kind: "PERCENT_OFF", percent: 30 } }),
          line({ productId: "riz", productName: "Riz", unitPriceCents: 150 }),
        ],
      }),
    ];
    expect(topProducts(purchases, "spend").map((p) => [p.productName, p.spendCents])).toEqual([
      ["Riz", 150],
      ["Penne", 140],
    ]);
  });

  it("adds up a product bought in several purchases", () => {
    const purchases = [purchase(), purchase({ lines: [line({ quantity: 3 })] })];
    expect(topProducts(purchases, "spend")).toEqual([{ productId: "penne", productName: "Penne", spendCents: 400, quantity: 4 }]);
  });

  it("ranks products by quantity, keeping decimals exact", () => {
    const purchases = [
      purchase({
        lines: [
          line({ productId: "pommes", productName: "Pommes", quantity: 0.1 }),
          line({ productId: "pommes", productName: "Pommes", quantity: 0.2 }),
          line({ productId: "riz", productName: "Riz", quantity: 2 }),
        ],
      }),
    ];
    expect(topProducts(purchases, "quantity").map((p) => [p.productName, p.quantity])).toEqual([
      ["Riz", 2],
      ["Pommes", 0.3],
    ]);
  });

  it("breaks ties by product name in French order", () => {
    const purchases = [
      purchase({
        lines: [line({ productId: "f", productName: "Farine" }), line({ productId: "e", productName: "Éclairs" })],
      }),
    ];
    expect(topProducts(purchases, "spend").map((p) => p.productName)).toEqual(["Éclairs", "Farine"]);
  });

  it("keeps the 5 first products only", () => {
    const lines = ["a", "b", "c", "d", "e", "f"].map((id, i) => line({ productId: id, productName: id, unitPriceCents: 100 + i }));
    expect(topProducts([purchase({ lines })], "spend").map((p) => p.productId)).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("is empty without purchases", () => {
    expect(topProducts([], "spend")).toEqual([]);
  });
});

describe("spendPerStore", () => {
  it("adds up the totals paid per store, highest first", () => {
    const purchases = [
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 1000 }),
      purchase({ storeId: "auchan", storeName: "Auchan", totalCents: 1500 }),
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 800 }),
    ];
    expect(spendPerStore(purchases)).toEqual([
      { storeId: "lidl", storeName: "Lidl", totalCents: 1800 },
      { storeId: "auchan", storeName: "Auchan", totalCents: 1500 },
    ]);
  });

  it("breaks ties by store name", () => {
    const purchases = [
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 1000 }),
      purchase({ storeId: "auchan", storeName: "Auchan", totalCents: 1000 }),
    ];
    expect(spendPerStore(purchases).map((s) => s.storeName)).toEqual(["Auchan", "Lidl"]);
  });
});

describe("savingsVsHighestPrice", () => {
  const seen = (storeId: string, priceCents: number, iso: string, productId = "penne"): ProductObservation => ({
    productId,
    storeId,
    priceCents,
    observedAt: day(iso),
    createdAt: day(iso),
  });
  // Penne, bought on 2026-10-10 at Lidl ("A"), 2 × 1,00 €; Lidl's own price is the purchase's observation.
  const bought = (overrides: Partial<StatLine> = {}) =>
    purchase({ purchasedAt: day("2026-10-10"), lines: [line({ quantity: 2, unitPriceCents: 100, ...overrides })] });
  const own = seen("lidl", 100, "2026-10-10");

  it("saves nothing when only one store has a price", () => {
    expect(savingsVsHighestPrice([bought()], [own])).toBe(0);
  });

  it("saves the gap with the most expensive store, times the quantity", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-01")])).toBe(60);
  });

  it("uses each store's latest price as of the purchase date", () => {
    const observations = [own, seen("auchan", 130, "2026-10-01"), seen("auchan", 110, "2026-10-05")];
    expect(savingsVsHighestPrice([bought()], observations)).toBe(20);
  });

  it("ignores prices recorded after the purchase", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-12")])).toBe(0);
  });

  it("never counts a negative saving when the store was already the most expensive", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 90, "2026-10-01")])).toBe(0);
  });

  it("compares the regular price, leaving promotions to their own indicator", () => {
    const promoted = bought({ promo: { kind: "PERCENT_OFF", percent: 30 } });
    expect(savingsVsHighestPrice([promoted], [own, seen("auchan", 130, "2026-10-01")])).toBe(60);
  });

  it("rounds loose quantities half up", () => {
    const loose = bought({ quantity: 1.5, unitPriceCents: 200 });
    expect(savingsVsHighestPrice([loose], [seen("lidl", 200, "2026-10-10"), seen("auchan", 235, "2026-10-01")])).toBe(53);
  });

  it("evaluates each purchase against its own date", () => {
    const early = purchase({ purchasedAt: day("2026-10-03"), lines: [line({ quantity: 2 })] });
    const observations = [seen("lidl", 100, "2026-10-03"), own, seen("auchan", 130, "2026-10-05")];
    expect(savingsVsHighestPrice([early, bought()], observations)).toBe(60);
  });

  it("only uses prices of the same product", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-01", "riz")])).toBe(0);
  });
});
