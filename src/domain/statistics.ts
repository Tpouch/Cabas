import { latestPricesByStore, type PriceObservationInput } from "./latest-prices";
import { multiplyByQuantity } from "./line-amount";
import type { Promo } from "./promo";
import { lineNet, sumOfDiscounts } from "./purchase";

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

export type ProductRank = { productId: string; productName: string; spendCents: number; quantity: number };
export type StoreSpend = { storeId: string; storeName: string; totalCents: number };

const byName = (a: string, b: string) => a.localeCompare(b, "fr");

export function topProducts(purchases: StatPurchase[], by: "spend" | "quantity", limit = 5): ProductRank[] {
  const ranks = new Map<string, ProductRank>();
  for (const line of purchases.flatMap((purchase) => purchase.lines)) {
    const rank = ranks.get(line.productId) ?? { productId: line.productId, productName: line.productName, spendCents: 0, quantity: 0 };
    rank.spendCents += lineNet(line);
    // Quantities have at most 3 decimals: round away float noise (0.1 + 0.2).
    rank.quantity = Math.round((rank.quantity + line.quantity) * 1000) / 1000;
    ranks.set(line.productId, rank);
  }
  const value = (rank: ProductRank) => (by === "spend" ? rank.spendCents : rank.quantity);
  return [...ranks.values()].sort((a, b) => value(b) - value(a) || byName(a.productName, b.productName)).slice(0, limit);
}

export function spendPerStore(purchases: StatPurchase[]): StoreSpend[] {
  const stores = new Map<string, StoreSpend>();
  for (const purchase of purchases) {
    const store = stores.get(purchase.storeId) ?? { storeId: purchase.storeId, storeName: purchase.storeName, totalCents: 0 };
    store.totalCents += purchase.totalCents;
    stores.set(purchase.storeId, store);
  }
  return [...stores.values()].sort((a, b) => b.totalCents - a.totalCents || byName(a.storeName, b.storeName));
}

export type ProductObservation = PriceObservationInput & { productId: string };

/** Spec §5.6: against the highest current price as of the purchase date, when at least two stores have one. */
export function savingsVsHighestPrice(purchases: StatPurchase[], observations: ProductObservation[]): number {
  const byProduct = Map.groupBy(observations, (observation) => observation.productId);
  let saved = 0;
  for (const purchase of purchases) {
    for (const line of purchase.lines) {
      const known = (byProduct.get(line.productId) ?? []).filter((o) => o.observedAt.getTime() <= purchase.purchasedAt.getTime());
      const prices = latestPricesByStore(known);
      if (prices.length < 2) continue;
      const reference = Math.max(...prices.map((price) => price.priceCents));
      saved += multiplyByQuantity(line.quantity, Math.max(0, reference - line.unitPriceCents));
    }
  }
  return saved;
}
