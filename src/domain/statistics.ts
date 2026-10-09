import type { Promo } from "./promo";
import { sumOfDiscounts } from "./purchase";

export type StatLine = { productId: string; productName: string; quantity: number; unitPriceCents: number; promo: Promo | null };
export type StatPurchase = { purchasedAt: Date; storeId: string; storeName: string; totalCents: number; lines: StatLine[] };
export type MonthTotal = { month: string; totalCents: number };

export function totalSpent(purchases: StatPurchase[]): number {
  return purchases.reduce((sum, purchase) => sum + purchase.totalCents, 0);
}

/** Null when there is nothing to compare with, so the UI hides the change. */
export function changeVsPrevious(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}

export function averageBasket(totalCents: number, count: number): number {
  return count === 0 ? 0 : Math.round(totalCents / count);
}

export function promotionSavings(purchases: StatPurchase[]): number {
  return purchases.reduce((sum, purchase) => sum + sumOfDiscounts(purchase.lines), 0);
}

export function fillMonths(months: string[], totals: MonthTotal[]): MonthTotal[] {
  const byMonth = new Map(totals.map((total) => [total.month, total.totalCents]));
  return months.map((month) => ({ month, totalCents: byMonth.get(month) ?? 0 }));
}
