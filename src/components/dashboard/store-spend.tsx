import { formatEuros } from "@/domain/money";
import type { StoreSpend } from "@/domain/statistics";

export function StoreSpendBars({ stores }: { stores: StoreSpend[] }) {
  const largest = Math.max(1, ...stores.map((store) => store.totalCents));

  return (
    <section aria-labelledby="store-spend-title" className="grid gap-3 rounded-md border bg-card p-4">
      <h2 id="store-spend-title" className="text-lg">
        Dépenses par magasin
      </h2>
      <ul className="grid gap-3">
        {stores.map((store) => (
          <li key={store.storeId} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate font-semibold">{store.storeName}</span>
              <span className="font-mono">{formatEuros(store.totalCents)}</span>
            </div>
            <div aria-hidden className="h-2 rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(store.totalCents / largest) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
