import { Tag } from "lucide-react";
import { isPromoReached, lineDiscount, type Promo, promoMinimumQuantity } from "@/domain/promo";
import { formatDiscount, formatPromo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { promo: Promo; quantity: number; unitPriceCents: number };

export function PromoStatus({ promo, quantity, unitPriceCents }: Props) {
  const reached = isPromoReached(quantity, promo);
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-sm font-semibold",
        reached ? "text-savings" : "text-amber-700 dark:text-amber-400",
      )}
    >
      <Tag className="size-4 shrink-0" aria-hidden />
      <span>
        {formatPromo(promo)} ·{" "}
        {reached ? (
          <span className="font-mono">{formatDiscount(lineDiscount(quantity, unitPriceCents, promo))}</span>
        ) : (
          `il faut ${promoMinimumQuantity(promo)} articles`
        )}
      </span>
    </span>
  );
}
