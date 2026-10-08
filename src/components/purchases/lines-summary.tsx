import { formatEuros } from "@/domain/money";
import { lineDiscount } from "@/domain/promo";
import { type LineAmounts, sumOfDiscounts, sumOfLines } from "@/domain/purchase";
import { formatDiscount } from "@/lib/format";

/** Rows shared by the purchase form and detail; place inside a <dl>. */
export function LinesSummary({ lines }: { lines: LineAmounts[] }) {
  const sum = sumOfLines(lines);
  const discounts = sumOfDiscounts(lines);
  const discounted = lines.filter((line) => lineDiscount(line.quantity, line.unitPriceCents, line.promo) > 0).length;
  return (
    <>
      {discounts > 0 && (
        <>
          <div className="flex justify-between text-muted-foreground">
            <dt>Avant promos</dt>
            <dd className="font-mono">{formatEuros(sum + discounts)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-savings">
            <dt>{`Promos (${discounted} ${discounted > 1 ? "articles" : "article"})`}</dt>
            <dd className="font-mono">{formatDiscount(discounts)}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between text-muted-foreground">
        <dt>Somme des articles</dt>
        <dd className="font-mono">{formatEuros(sum)}</dd>
      </div>
    </>
  );
}
