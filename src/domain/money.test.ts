import { describe, expect, it } from "vitest";
import { formatEuros, parseEuros } from "./money";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("parseEuros", () => {
  it.each([
    ["1,29", 129],
    ["1.29", 129],
    ["1,29 €", 129],
    ["€1.29", 129],
    [" 2 ", 200],
    ["0,5", 50],
    ["12", 1200],
    ["1 234,56", 123456],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseEuros(input)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "-1", "1,999", "1,2,3", "1e3"])("rejects %j", (input) => {
    expect(parseEuros(input)).toBeNull();
  });
});

describe("formatEuros", () => {
  it("formats cents as French euros", () => {
    expect(plain(formatEuros(129))).toBe("1,29 €");
    expect(plain(formatEuros(123456))).toBe("1 234,56 €");
    expect(plain(formatEuros(0))).toBe("0,00 €");
  });
});
