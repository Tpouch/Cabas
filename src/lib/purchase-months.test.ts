import { describe, expect, it } from "vitest";
import { groupByMonth, monthKey } from "./purchase-months";

const purchase = (id: string, iso: string, totalCents: number) => ({
  id,
  purchasedAt: new Date(`${iso}T00:00:00.000Z`),
  totalCents,
});

describe("monthKey", () => {
  it("uses the calendar month of the purchase date", () => {
    expect(monthKey(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09");
  });
});

describe("groupByMonth", () => {
  it("groups purchases by month, newest month first, with each month's total", () => {
    const groups = groupByMonth([
      purchase("a", "2026-10-03", 4862),
      purchase("b", "2026-09-30", 11230),
      purchase("c", "2026-09-24", 2790),
    ]);
    expect(groups).toEqual([
      { month: "2026-10", label: "Octobre 2026", totalCents: 4862, purchases: [expect.objectContaining({ id: "a" })] },
      {
        month: "2026-09",
        label: "Septembre 2026",
        totalCents: 14020,
        purchases: [expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "c" })],
      },
    ]);
  });

  it("returns nothing for no purchases", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
