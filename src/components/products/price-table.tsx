import { Badge } from "@/components/ui/badge";
import { formatEuros } from "@/domain/money";
import { formatPerMeasure, formatPriceAge } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type { StorePriceRow } from "@/server/repositories/prices";
import type { ProductSummary } from "@/server/repositories/products";

export function PriceTable({ product, rows, now }: { product: ProductSummary; rows: StorePriceRow[]; now: Date }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Aucun prix relevé pour ce produit.
      </p>
    );
  }
  return (
    <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
      <thead className="sr-only lg:not-sr-only">
        <tr className="text-left text-xs tracking-wider text-muted-foreground uppercase">
          <th className="px-3 py-2 font-semibold">Magasin</th>
          <th className="hidden px-3 py-2 font-semibold lg:table-cell">Relevé</th>
          <th className="px-3 py-2 text-right font-semibold">Prix</th>
          <th className="hidden px-3 py-2 text-right font-semibold lg:table-cell">Prix unitaire</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dashed">
        {rows.map(({ store, priceCents, observedAt, isCheapest }) => (
          <tr key={store.id} className={cn(isCheapest && "bg-savings-soft")}>
            <td className="px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-xs font-bold text-primary">
                  {store.logoPath ? (
                    <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" />
                  ) : (
                    store.name[0]
                  )}
                </div>
                <div>
                  <span className="font-medium">{store.name}</span>
                  {isCheapest && <Badge className="ml-2 bg-savings text-white">Moins cher</Badge>}
                  <span className="block text-xs text-muted-foreground lg:hidden">{formatPriceAge(observedAt, now)}</span>
                </div>
              </div>
            </td>
            <td className="hidden px-3 text-muted-foreground lg:table-cell">{formatPriceAge(observedAt, now)}</td>
            <td className="px-3 text-right font-mono font-bold">
              {formatEuros(priceCents)}
              <span className="block text-xs font-medium text-muted-foreground lg:hidden">
                {formatPerMeasure(priceCents, product.sizeValue, product.sizeUnit)}
              </span>
            </td>
            <td className="hidden px-3 text-right font-mono lg:table-cell">
              {formatPerMeasure(priceCents, product.sizeValue, product.sizeUnit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
