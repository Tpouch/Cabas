"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEuros } from "@/domain/money";
import { formatQuantity } from "@/domain/purchase";
import type { ProductRank } from "@/domain/statistics";

type Ranking = "spend" | "quantity";
const RANKINGS: { value: Ranking; label: string }[] = [
  { value: "spend", label: "Dépense" },
  { value: "quantity", label: "Quantité" },
];

export function TopProducts({ bySpend, byQuantity }: { bySpend: ProductRank[]; byQuantity: ProductRank[] }) {
  const [ranking, setRanking] = useState<Ranking>("spend");
  const products = ranking === "spend" ? bySpend : byQuantity;

  return (
    <section aria-labelledby="top-products-title" className="grid gap-3 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="top-products-title" className="text-lg">
          Produits les plus achetés
        </h2>
        <div className="flex gap-1">
          {RANKINGS.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={ranking === value ? "default" : "outline"}
              aria-pressed={ranking === value}
              className="h-11"
              onClick={() => setRanking(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <ol aria-label="Produits les plus achetés" className="divide-y divide-dashed">
        {products.map((product) => (
          <li key={product.productId}>
            <Link href={`/products/${product.productId}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span className="truncate">{product.productName}</span>
              <span className="font-mono">
                {ranking === "spend" ? formatEuros(product.spendCents) : `× ${formatQuantity(product.quantity)}`}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
