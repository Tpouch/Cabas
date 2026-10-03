import { describe, expect, it } from "vitest";
import { rankAlternatives, type ProductPricing } from "./alternatives";

const penne: ProductPricing = { id: "penne", sizeValue: 500, sizeUnit: "G", bestPriceCents: 99 };
const combino: ProductPricing = { id: "combino", sizeValue: 1000, sizeUnit: "G", bestPriceCents: 158 };
const panzani: ProductPricing = { id: "panzani", sizeValue: 500, sizeUnit: "G", bestPriceCents: 105 };
const gnocchi: ProductPricing = { id: "gnocchi", sizeValue: 12, sizeUnit: "PIECE", bestPriceCents: 300 };
const fresh: ProductPricing = { id: "fresh", sizeValue: 400, sizeUnit: "G", bestPriceCents: null };

describe("rankAlternatives", () => {
  it("puts comparable alternatives first, cheapest per unit first, then other units, then unpriced", () => {
    const ranked = rankAlternatives(penne, [fresh, gnocchi, panzani, combino]);
    expect(ranked.map((a) => a.id)).toEqual(["combino", "panzani", "gnocchi", "fresh"]);
  });

  it("shows the per-unit discount of a cheaper comparable alternative", () => {
    const [first] = rankAlternatives(penne, [combino]);
    expect(first?.perMeasureCents).toBe(158);
    expect(first?.discountPercent).toBe(20);
  });

  it("shows no discount for a more expensive alternative", () => {
    expect(rankAlternatives(penne, [panzani])[0]?.discountPercent).toBeNull();
  });

  it("shows no discount across different units", () => {
    expect(rankAlternatives(penne, [gnocchi])[0]?.discountPercent).toBeNull();
  });

  it("shows no discount when the current product has no price", () => {
    const unpriced = { ...penne, bestPriceCents: null };
    expect(rankAlternatives(unpriced, [combino])[0]?.discountPercent).toBeNull();
  });

  it("gives an unpriced alternative no price per unit", () => {
    expect(rankAlternatives(penne, [fresh])[0]?.perMeasureCents).toBeNull();
  });
});
