import { describe, expect, it } from "vitest";
import {
  averageBasket,
  changeVsPrevious,
  fillMonths,
  promotionSavings,
  type StatLine,
  type StatPurchase,
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
