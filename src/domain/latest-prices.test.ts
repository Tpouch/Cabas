import { describe, expect, it } from "vitest";
import { cheapestStorePrice, latestPricesByStore, type PriceObservationInput } from "./latest-prices";

const obs = (
  storeId: string,
  priceCents: number,
  observedAt: string,
  createdAt = `${observedAt}T12:00:00Z`,
): PriceObservationInput => ({
  storeId,
  priceCents,
  observedAt: new Date(`${observedAt}T00:00:00Z`),
  createdAt: new Date(createdAt),
});

describe("latestPricesByStore", () => {
  it("keeps only the most recent observation of each store", () => {
    const result = latestPricesByStore([
      obs("lidl", 89, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("leclerc", 115, "2026-09-20"),
    ]);
    expect(result.map((p) => [p.storeId, p.priceCents])).toEqual([
      ["lidl", 99],
      ["leclerc", 115],
    ]);
  });

  it("breaks a same-day tie with the latest entry", () => {
    const result = latestPricesByStore([
      obs("lidl", 99, "2026-10-01", "2026-10-01T09:00:00Z"),
      obs("lidl", 95, "2026-10-01", "2026-10-01T18:00:00Z"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.priceCents).toBe(95);
  });

  it("sorts stores from cheapest to most expensive", () => {
    const result = latestPricesByStore([
      obs("auchan", 129, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("leclerc", 115, "2026-09-20"),
    ]);
    expect(result.map((p) => p.storeId)).toEqual(["lidl", "leclerc", "auchan"]);
  });

  it("returns nothing when there is no observation", () => {
    expect(latestPricesByStore([])).toEqual([]);
  });
});

describe("cheapestStorePrice", () => {
  it("returns the lowest price, preferring the most recent on a tie", () => {
    const prices = latestPricesByStore([
      obs("leclerc", 99, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("auchan", 129, "2026-10-02"),
    ]);
    expect(cheapestStorePrice(prices)?.storeId).toBe("lidl");
  });

  it("returns null without prices", () => {
    expect(cheapestStorePrice([])).toBeNull();
  });
});
