"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEuros, parseEuros } from "@/domain/money";
import { lineSubtotal, parseQuantity } from "@/domain/purchase";
import { formatSize } from "@/lib/format";
import type { DraftLine } from "@/lib/purchase-draft";
import type { ProductSummary } from "@/server/repositories/products";
import { QuantityStepper } from "./quantity-stepper";

type Props = {
  lines: DraftLine[];
  productsById: Map<string, ProductSummary>;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
};

export function PurchaseLines({ lines, productsById, onChange, onRemove }: Props) {
  if (lines.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Aucun article pour l’instant. Cherche un produit ci-dessous pour l’ajouter.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-dashed rounded-md border bg-card">
      {lines.map((line) => {
        const product = productsById.get(line.productId);
        const name = product?.name ?? "Produit";
        const quantity = parseQuantity(line.quantity);
        const price = parseEuros(line.unitPrice);
        const priceId = `price-${line.key}`;
        return (
          <li
            key={line.key}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 lg:grid-cols-[1fr_auto_8rem_6rem_auto]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {product && (
                <p className="text-xs text-muted-foreground">
                  {[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 lg:order-last"
              aria-label={`Retirer ${name}`}
              onClick={() => onRemove(line.key)}
            >
              <Trash2 aria-hidden />
            </Button>
            <QuantityStepper
              id={`quantity-${line.key}`}
              label={`Quantité de ${name}`}
              value={line.quantity}
              onChange={(value) => onChange(line.key, { quantity: value })}
            />
            <div className="flex items-center gap-1.5">
              <label htmlFor={priceId} className="sr-only">
                {`Prix unitaire de ${name}`}
              </label>
              <Input
                id={priceId}
                inputMode="decimal"
                placeholder="Prix"
                className="font-mono"
                value={line.unitPrice}
                aria-invalid={price === null ? true : undefined}
                onChange={(event) => onChange(line.key, { unitPrice: event.target.value })}
              />
              <span className="text-sm text-muted-foreground">€</span>
            </div>
            <p className="col-span-2 text-right font-mono font-bold lg:col-span-1">
              {quantity !== null && price !== null ? formatEuros(lineSubtotal(quantity, price)) : "—"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
