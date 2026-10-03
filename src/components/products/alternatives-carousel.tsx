"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { runAction } from "@/components/common/run-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RankedAlternative } from "@/domain/alternatives";
import { formatEuros } from "@/domain/money";
import { measureLabel } from "@/domain/unit-price";
import { uploadUrl } from "@/lib/uploads";
import { removeAlternativeAction } from "@/server/actions/alternatives";
import type { ProductSummary } from "@/server/repositories/products";

type Item = RankedAlternative & Pick<ProductSummary, "name" | "photoPath">;

export function AlternativesCarousel({ productId, items }: { productId: string; items: Item[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune alternative pour l’instant.</p>;
  }
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 lg:mx-0 lg:px-0">
      {items.map((item) => (
        <li key={item.id} className="relative w-36 shrink-0 snap-start rounded-md border bg-card p-2">
          <Link href={`/products/${item.id}`} className="grid gap-1">
            <div className="h-20 overflow-hidden rounded-sm bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)]">
              {item.photoPath && (
                <img src={uploadUrl(item.photoPath, { thumb: true })} alt="" loading="lazy" className="size-full object-cover" />
              )}
            </div>
            <span className="pr-6 text-sm leading-tight font-semibold">{item.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {item.perMeasureCents === null
                ? "Pas de prix"
                : `${formatEuros(Math.round(item.perMeasureCents))}/${measureLabel(item.sizeUnit)}`}
            </span>
            {item.discountPercent !== null && (
              <Badge className="w-fit bg-savings text-white">−{item.discountPercent} %</Badge>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 size-11"
            aria-label={`Retirer ${item.name} des alternatives`}
            onClick={() => runAction(removeAlternativeAction(productId, item.id), "Alternative retirée")}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
