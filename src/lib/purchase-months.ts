import { formatMonthLabel } from "./format";

export type MonthGroup<T> = { month: string; label: string; totalCents: number; purchases: T[] };

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function groupByMonth<T extends { purchasedAt: Date; totalCents: number }>(purchases: T[]): MonthGroup<T>[] {
  const groups = new Map<string, MonthGroup<T>>();
  for (const purchase of purchases) {
    const month = monthKey(purchase.purchasedAt);
    const group = groups.get(month) ?? { month, label: formatMonthLabel(month), totalCents: 0, purchases: [] };
    group.totalCents += purchase.totalCents;
    group.purchases.push(purchase);
    groups.set(month, group);
  }
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month));
}
