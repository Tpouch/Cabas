import { multiplyByQuantity, wholeUnits } from "./line-amount";

export const PROMO_KINDS = ["AMOUNT_OFF_PER_UNIT", "PERCENT_OFF", "NTH_PERCENT_OFF", "BUY_GET_FREE"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export type Promo =
  | { kind: "AMOUNT_OFF_PER_UNIT"; amountCents: number }
  | { kind: "PERCENT_OFF"; percent: number }
  | { kind: "NTH_PERCENT_OFF"; nth: number; percent: number }
  | { kind: "BUY_GET_FREE"; buy: number; free: number };

type Range = { min: number; max: number };

export const PROMO_LIMITS = {
  percent: { min: 1, max: 100 },
  nth: { min: 2, max: 10 },
  items: { min: 1, max: 20 },
} as const satisfies Record<string, Range>;

export function inRange(value: number, range: Range): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** A per-item discount cannot exceed the unit price. */
export function isPromoValid(promo: Promo, unitPriceCents: number): boolean {
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return inRange(promo.amountCents, { min: 1, max: unitPriceCents });
    case "PERCENT_OFF":
      return inRange(promo.percent, PROMO_LIMITS.percent);
    case "NTH_PERCENT_OFF":
      return inRange(promo.nth, PROMO_LIMITS.nth) && inRange(promo.percent, PROMO_LIMITS.percent);
    case "BUY_GET_FREE":
      return inRange(promo.buy, PROMO_LIMITS.items) && inRange(promo.free, PROMO_LIMITS.items);
  }
}

function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

function uncappedDiscount(quantity: number, unitPriceCents: number, promo: Promo): number {
  const units = wholeUnits(quantity);
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return multiplyByQuantity(quantity, promo.amountCents);
    case "PERCENT_OFF":
      return percentOf(multiplyByQuantity(quantity, unitPriceCents), promo.percent);
    case "NTH_PERCENT_OFF":
      return percentOf(Math.floor(units / promo.nth) * unitPriceCents, promo.percent);
    case "BUY_GET_FREE": {
      // Items are taken in groups of buy + free; a partial group gets the free items past `buy`.
      const group = promo.buy + promo.free;
      const freeItems = Math.floor(units / group) * promo.free + Math.max(0, (units % group) - promo.buy);
      return freeItems * unitPriceCents;
    }
  }
}

/** Never more than the line amount; no promotion, no discount. */
export function lineDiscount(quantity: number, unitPriceCents: number, promo: Promo | null | undefined): number {
  if (!promo) return 0;
  return Math.min(uncappedDiscount(quantity, unitPriceCents, promo), multiplyByQuantity(quantity, unitPriceCents));
}

export function promoMinimumQuantity(promo: Promo): number | null {
  switch (promo.kind) {
    case "NTH_PERCENT_OFF":
      return promo.nth;
    case "BUY_GET_FREE":
      return promo.buy + 1;
    default:
      return null;
  }
}

export function isPromoReached(quantity: number, promo: Promo): boolean {
  const minimum = promoMinimumQuantity(promo);
  return minimum === null || wholeUnits(quantity) >= minimum;
}

const WHOLE_NUMBER = /^\d{1,3}$/;

/** A typed percentage, rank or item count; null when it is not a whole number. */
export function parsePromoNumber(input: string): number | null {
  const compact = input.trim();
  return WHOLE_NUMBER.test(compact) ? Number(compact) : null;
}
