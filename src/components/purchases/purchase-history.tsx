import Link from "next/link";
import { formatEuros } from "@/domain/money";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import type { MonthGroup } from "@/lib/purchase-months";
import { uploadUrl } from "@/lib/uploads";
import type { PurchaseListItem } from "@/server/repositories/purchases";

function articles(count: number): string {
  return `${count} ${count > 1 ? "articles" : "article"}`;
}

function StoreLogo({ store }: { store: PurchaseListItem["store"] }) {
  return (
    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-sm font-bold text-primary">
      {store.logoPath ? <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" /> : store.name[0]}
    </div>
  );
}

export function PurchaseHistory({ groups }: { groups: MonthGroup<PurchaseListItem>[] }) {
  return (
    <div className="grid gap-6">
      {groups.map((group) => {
        const month = group.label.toLocaleLowerCase("fr-FR");
        const listLabel = `Courses ${/^[aeiouy]/.test(month) ? "d’" : "de "}${month}`;
        return (
          <section key={group.month} aria-labelledby={`month-${group.month}`} className="grid gap-2">
            <h2
              id={`month-${group.month}`}
              className="flex justify-between font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              <span>{group.label}</span> <span className="font-mono">{formatEuros(group.totalCents)}</span>
            </h2>

            <ul aria-label={listLabel} className="grid gap-3 lg:hidden">
              {group.purchases.map((purchase) => (
                <li key={purchase.id}>
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="receipt-edge flex items-center gap-3 rounded-md border bg-card px-3 py-3 active:scale-[0.99]"
                  >
                    <StoreLogo store={purchase.store} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{purchase.store.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDayLabel(purchase.purchasedAt)} · {articles(purchase.itemCount)}
                      </span>
                    </span>
                    <span className="font-mono font-bold">{formatEuros(purchase.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full overflow-hidden rounded-md border bg-card text-sm lg:table">
              <thead>
                <tr className="text-left text-xs tracking-wider text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Magasin</th>
                  <th className="px-3 py-2 text-right font-semibold">Articles</th>
                  <th className="px-3 py-2 font-semibold">Ticket</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed">
                {group.purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-secondary/50">
                    <td className="px-3 py-2.5 font-mono">{formatShortDate(purchase.purchasedAt)}</td>
                    <td className="px-3">
                      <Link href={`/purchases/${purchase.id}`} className="font-semibold hover:underline">
                        {purchase.store.name}
                      </Link>
                    </td>
                    <td className="px-3 text-right font-mono">{purchase.itemCount}</td>
                    <td className="px-3">
                      {purchase.receiptPath ? (
                        <a href={uploadUrl(purchase.receiptPath)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Voir
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 text-right font-mono font-bold">{formatEuros(purchase.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
