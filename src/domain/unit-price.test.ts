import { describe, expect, it } from "vitest";
import { areComparable, measureLabel, pricePerMeasure } from "./unit-price";

describe("pricePerMeasure", () => {
  it("computes the price per kilo of a 500 g product", () => {
    expect(pricePerMeasure(99, 500, "G")).toBe(198);
  });
  it("computes the price per litre of a 1 L product", () => {
    expect(pricePerMeasure(109, 1000, "ML")).toBe(109);
  });
  it("computes the price per piece of a pack of 12", () => {
    expect(pricePerMeasure(315, 12, "PIECE")).toBe(26.25);
  });
  it("rejects a non-positive size", () => {
    expect(() => pricePerMeasure(100, 0, "G")).toThrow(RangeError);
  });
});

describe("measureLabel", () => {
  it("names the measure of each unit", () => {
    expect(measureLabel("G")).toBe("kg");
    expect(measureLabel("ML")).toBe("L");
    expect(measureLabel("PIECE")).toBe("pièce");
  });
});

describe("areComparable", () => {
  it("compares products only when they share a unit", () => {
    expect(areComparable({ sizeUnit: "G" }, { sizeUnit: "G" })).toBe(true);
    expect(areComparable({ sizeUnit: "G" }, { sizeUnit: "PIECE" })).toBe(false);
  });
});
