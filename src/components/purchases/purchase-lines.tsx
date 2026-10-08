"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEuros, parseEuros } from "@/domain/money";
import { lineDiscount } from "@/domain/promo";
import { lineSubtotal, parseQuantity } from "@/domain/purchase";
import { formatSize } from "@/lib/format";
import { draftLineAmounts, type DraftLine } from "@/lib/purchase-draft";
import type { ProductSummary } from "@/server/repositories/products";
import { PromoEditor } from "./promo-editor";
import { QuantityStepper } from "./quantity-stepper";

type Props = {
  lines: DraftLine[];
  productsById: Map<string, ProductSummary>;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  /** The last save was refused: unfinished promotions show their empty fields. */
  showMissing?: boolean;
};

export function PurchaseLines({ lines, productsById, onChange, onRemove, showMissing = false }: Props) {
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
        const amounts = draftLineAmounts(line);
        const gross = amounts && lineSubtotal(amounts.quantity, amounts.unitPriceCents);
        const discount = amounts ? lineDiscount(amounts.quantity, amounts.unitPriceCents, amounts.promo) : 0;
        const priceId = `price-${line.key}`;
        return (
          <li key={line.key} className="grid gap-2 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
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
                className="-mt-1.5 -mr-1.5 size-11 shrink-0"
                aria-label={`Retirer ${name}`}
                onClick={() => onRemove(line.key)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            {/* Wraps the subtotal under the controls on narrow screens, keeps one row when there is room. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <QuantityStepper
                id={`quantity-${line.key}`}
                label={`Quantité de ${name}`}
                value={line.quantity}
                onChange={(value) => onChange(line.key, { quantity: value })}
              />
              <div className="flex w-36 items-center gap-1.5">
                <label htmlFor={priceId} className="sr-only">
                  {`Prix unitaire de ${name}`}
                </label>
                <Input
                  id={priceId}
                  inputMode="decimal"
                  placeholder="Prix"
                  className="font-mono"
                  value={line.unitPrice}
                  aria-invalid={line.unitPrice.trim() !== "" && price === null ? true : undefined}
                  onChange={(event) => onChange(line.key, { unitPrice: event.target.value })}
                />
                <span className="text-sm text-muted-foreground">€</span>
              </div>
              <p className="ml-auto font-mono font-bold">
                {gross === null ? (
                  "—"
                ) : discount > 0 ? (
                  <>
                    <s className="mr-1.5 font-normal text-muted-foreground">{formatEuros(gross)}</s>
                    {formatEuros(gross - discount)}
                  </>
                ) : (
                  formatEuros(gross)
                )}
              </p>
            </div>
            <PromoEditor
              lineKey={line.key}
              productName={name}
              promo={line.promo}
              quantity={quantity}
              unitPriceCents={price}
              showMissing={showMissing}
              onChange={(promo) => onChange(line.key, { promo })}
            />
          </li>
        );
      })}
    </ul>
  );
}
