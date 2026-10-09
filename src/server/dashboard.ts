import "server-only";
import {
  averageBasket,
  changeVsPrevious,
  fillMonths,
  type MonthTotal,
  type ProductRank,
  promotionSavings,
  savingsVsHighestPrice,
  spendPerStore,
  type StoreSpend,
  topProducts,
  totalSpent,
} from "@/domain/statistics";
import { lastTwelveMonths, monthRange, previousMonth } from "@/lib/months";
import { monthKey } from "@/lib/purchase-months";
import { listObservationsForProducts, listPurchasesForStats, monthlyTotals } from "./repositories/statistics";

export type Dashboard = {
  month: string;
  previousMonth: string;
  purchaseCount: number;
  totalCents: number;
  changePercent: number | null;
  averageBasketCents: number;
  promotionSavingsCents: number;
  priceSavingsCents: number;
  months: MonthTotal[];
  topBySpend: ProductRank[];
  topByQuantity: ProductRank[];
  stores: StoreSpend[];
};

export async function loadDashboard(month: string): Promise<Dashboard> {
  const previous = previousMonth(month);
  const window = lastTwelveMonths(month);
  const { end } = monthRange(month);
  const [recent, totals] = await Promise.all([
    listPurchasesForStats(monthRange(previous).start, end),
    monthlyTotals(monthRange(window[0] ?? month).start, end),
  ]);
  const purchases = recent.filter((purchase) => monthKey(purchase.purchasedAt) === month);
  const previousPurchases = recent.filter((purchase) => monthKey(purchase.purchasedAt) === previous);
  const productIds = [...new Set(purchases.flatMap((purchase) => purchase.lines.map((line) => line.productId)))];
  const observations = await listObservationsForProducts(productIds, end);
  const totalCents = totalSpent(purchases);

  return {
    month,
    previousMonth: previous,
    purchaseCount: purchases.length,
    totalCents,
    changePercent: changeVsPrevious(totalCents, totalSpent(previousPurchases)),
    averageBasketCents: averageBasket(totalCents, purchases.length),
    promotionSavingsCents: promotionSavings(purchases),
    priceSavingsCents: savingsVsHighestPrice(purchases, observations),
    months: fillMonths(window, totals),
    topBySpend: topProducts(purchases, "spend"),
    topByQuantity: topProducts(purchases, "quantity"),
    stores: spendPerStore(purchases),
  };
}
