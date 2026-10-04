import { describe, expect, it } from "vitest";
import { formatQuantity, lineSubtotal, parseQuantity, stepQuantity, sumOfLines } from "./purchase";

describe("lineSubtotal", () => {
  it("multiplies quantity by unit price and rounds to the cent", () => {
    expect(lineSubtotal(2, 99)).toBe(198);
    expect(lineSubtotal(1.2, 249)).toBe(299); // 298.8
    expect(lineSubtotal(0.75, 250)).toBe(188); // 187.5 rounds half up
  });

  it("does not drift on float quantities", () => {
    expect(lineSubtotal(0.1, 30)).toBe(3);
    expect(lineSubtotal(1.005, 1000)).toBe(1005);
  });
});

describe("sumOfLines", () => {
  it("sums rounded subtotals", () => {
    expect(
      sumOfLines([
        { quantity: 2, unitPriceCents: 99 },
        { quantity: 1.2, unitPriceCents: 249 },
        { quantity: 6, unitPriceCents: 109 },
      ]),
    ).toBe(198 + 299 + 654);
  });

  it("is zero without lines", () => {
    expect(sumOfLines([])).toBe(0);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["2", 2],
    ["1,2", 1.2],
    ["1.25", 1.25],
    [" 0,5 ", 0.5],
    ["0,125", 0.125],
    ["9999", 9999],
  ])("parses %j", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it.each(["", "0", "0,000", "-1", "1,2345", "abc", "1e3", "10000", "1,2,3"])("rejects %j", (input) => {
    expect(parseQuantity(input)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("writes French decimals without trailing zeros", () => {
    expect(formatQuantity(1.2)).toBe("1,2");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0.125)).toBe("0,125");
    expect(formatQuantity(1250)).toBe("1250");
  });
});

describe("stepQuantity", () => {
  it("adds or removes one unit", () => {
    expect(stepQuantity(2, 1)).toBe(3);
    expect(stepQuantity(1.2, 1)).toBe(2.2);
    expect(stepQuantity(2.2, -1)).toBe(1.2);
  });

  it("never goes to zero or below", () => {
    expect(stepQuantity(1, -1)).toBe(1);
    expect(stepQuantity(0.5, -1)).toBe(0.5);
  });
});
