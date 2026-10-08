import { describe, expect, it } from "vitest";
import { multiplyByQuantity, wholeUnits } from "./line-amount";

describe("multiplyByQuantity", () => {
  it("multiplies on thousandths and rounds half up to the cent", () => {
    expect(multiplyByQuantity(1.005, 1000)).toBe(1005);
    expect(multiplyByQuantity(0.75, 250)).toBe(188);
  });
});

describe("wholeUnits", () => {
  it.each([
    [3, 3],
    [1.5, 1],
    [2.999, 2],
    [0.5, 0],
    [3.0000000000000004, 3],
  ])("counts %d as %d whole items", (quantity, expected) => {
    expect(wholeUnits(quantity)).toBe(expected);
  });
});
