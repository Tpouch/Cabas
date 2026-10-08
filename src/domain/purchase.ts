import { multiplyByQuantity } from "./line-amount";
import { lineDiscount, type Promo } from "./promo";

export type PurchaseLine = { productId: string; quantity: number; unitPriceCents: number; promo?: Promo | null };
export type LineAmounts = Pick<PurchaseLine, "quantity" | "unitPriceCents" | "promo">;

const QUANTITY_PATTERN = /^\d+(?:[.,]\d{1,3})?$/;
const MAX_QUANTITY = 9999;
const quantityFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3, useGrouping: false });

export function lineSubtotal(quantity: number, unitPriceCents: number): number {
  return multiplyByQuantity(quantity, unitPriceCents);
}

export function lineNet(line: LineAmounts): number {
  return lineSubtotal(line.quantity, line.unitPriceCents) - lineDiscount(line.quantity, line.unitPriceCents, line.promo);
}

export function sumOfLines(lines: LineAmounts[]): number {
  return lines.reduce((sum, line) => sum + lineNet(line), 0);
}

export function sumOfDiscounts(lines: LineAmounts[]): number {
  return lines.reduce((sum, line) => sum + lineDiscount(line.quantity, line.unitPriceCents, line.promo), 0);
}

export function parseQuantity(input: string): number | null {
  const compact = input.trim();
  if (!QUANTITY_PATTERN.test(compact)) return null;
  const quantity = Number(compact.replace(",", "."));
  return quantity > 0 && quantity <= MAX_QUANTITY ? quantity : null;
}

export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity);
}

export function stepQuantity(quantity: number, direction: 1 | -1): number {
  const next = Math.round((quantity + direction) * 1000) / 1000;
  return next > 0 ? next : quantity;
}
