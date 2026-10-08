import { describe, expect, it } from "vitest";
import {
  isPromoReached,
  isPromoValid,
  lineDiscount,
  parsePromoNumber,
  type Promo,
  promoMinimumQuantity,
} from "./promo";

const amountOff: Promo = { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 };
const percentOff: Promo = { kind: "PERCENT_OFF", percent: 30 };
const secondAt60: Promo = { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 };
const twoPlusOne: Promo = { kind: "BUY_GET_FREE", buy: 2, free: 1 };
const twoPlusTwo: Promo = { kind: "BUY_GET_FREE", buy: 2, free: 2 };

describe("lineDiscount", () => {
  it.each([
    ["−0,50 € per item on 3 items", amountOff, 3, 150],
    ["−30 % on 3 items", percentOff, 3, 108],
    ["the 2nd at −60 % on 3 items", secondAt60, 3, 72],
    ["the 2nd at −60 % on 4 items", secondAt60, 4, 144],
    ["2 bought = 1 free on 2 items (not reached)", twoPlusOne, 2, 0],
    ["2 bought = 1 free on 3 items", twoPlusOne, 3, 120],
    ["2 bought = 1 free on 6 items", twoPlusOne, 6, 240],
    ["2 bought = 2 free on 3 items", twoPlusTwo, 3, 120],
    ["the 2nd at −60 % on a loose 1.5", secondAt60, 1.5, 0],
  ])("computes %s", (_, promo, quantity, expected) => {
    expect(lineDiscount(quantity, 120, promo)).toBe(expected);
  });

  it("gives no discount without a promotion", () => {
    expect(lineDiscount(3, 120, null)).toBe(0);
    expect(lineDiscount(3, 120, undefined)).toBe(0);
  });

  it("makes a line free at −100 %", () => {
    expect(lineDiscount(3, 120, { kind: "PERCENT_OFF", percent: 100 })).toBe(360);
  });

  it("never discounts more than the line amount", () => {
    expect(lineDiscount(1, 120, { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 200 })).toBe(120);
  });

  it("applies a per-item discount per kilo on a loose product", () => {
    expect(lineDiscount(1.5, 249, { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 })).toBe(75);
    expect(lineDiscount(1.5, 249, percentOff)).toBe(112); // 30 % of 374
  });

  it("rounds a percentage half up to the cent", () => {
    expect(lineDiscount(1, 105, { kind: "PERCENT_OFF", percent: 50 })).toBe(53); // 52.5
  });
});

describe("promoMinimumQuantity and isPromoReached", () => {
  it("needs N items for the Nth item and N + 1 for a free one", () => {
    expect(promoMinimumQuantity(secondAt60)).toBe(2);
    expect(promoMinimumQuantity(twoPlusOne)).toBe(3);
    expect(promoMinimumQuantity(percentOff)).toBeNull();
  });

  it("counts whole items only", () => {
    expect(isPromoReached(2, twoPlusOne)).toBe(false);
    expect(isPromoReached(3, twoPlusOne)).toBe(true);
    expect(isPromoReached(1.5, secondAt60)).toBe(false);
    expect(isPromoReached(0.4, amountOff)).toBe(true);
  });
});

describe("isPromoValid", () => {
  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 120 },
    { kind: "PERCENT_OFF", percent: 100 },
    { kind: "NTH_PERCENT_OFF", nth: 10, percent: 1 },
    { kind: "BUY_GET_FREE", buy: 20, free: 1 },
  ])("accepts %j", (promo) => {
    expect(isPromoValid(promo, 120)).toBe(true);
  });

  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 121 },
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 0 },
    { kind: "PERCENT_OFF", percent: 0 },
    { kind: "PERCENT_OFF", percent: 101 },
    { kind: "PERCENT_OFF", percent: 12.5 },
    { kind: "NTH_PERCENT_OFF", nth: 1, percent: 50 },
    { kind: "NTH_PERCENT_OFF", nth: 11, percent: 50 },
    { kind: "BUY_GET_FREE", buy: 0, free: 1 },
    { kind: "BUY_GET_FREE", buy: 2, free: 21 },
  ])("rejects %j", (promo) => {
    expect(isPromoValid(promo, 120)).toBe(false);
  });
});

describe("parsePromoNumber", () => {
  it.each([
    ["2", 2],
    [" 60 ", 60],
    ["100", 100],
  ])("parses %j", (input, expected) => {
    expect(parsePromoNumber(input)).toBe(expected);
  });

  it.each(["", "abc", "1,5", "-2", "1000"])("rejects %j", (input) => {
    expect(parsePromoNumber(input)).toBeNull();
  });
});
