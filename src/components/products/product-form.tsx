"use client";

import { useCallback, useRef, useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEuros } from "@/domain/money";
import type { SizeUnit } from "@/domain/types";
import { formatPerMeasure } from "@/lib/format";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";

type Props = {
  action: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
  product?: ProductSummary;
  defaultName?: string;
  /** Shown when the product is created from a purchase: its price in that store. */
  priceLabel?: string;
  onDone: (product: ProductSummary, priceCents: number | null) => void;
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProductForm({ action, product, defaultName, priceLabel, onDone }: Props) {
  const [sizeValue, setSizeValue] = useState(product?.sizeValue ? String(product.sizeValue) : "");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(product?.sizeUnit ?? "G");
  const [price, setPrice] = useState("");
  const priceRef = useRef<number | null>(null);
  const done = useCallback((saved: ProductSummary) => onDone(saved, priceRef.current), [onDone]);
  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, done);

  const priceCents = parseEuros(price);
  const size = Number(sizeValue);
  const perMeasure =
    priceCents && Number.isInteger(size) && size > 0 ? `= ${formatPerMeasure(priceCents, size, sizeUnit)}` : " ";

  return (
    <form ref={formRef} className="grid gap-4" noValidate onSubmit={onSubmit}>
      <ImageField name="photo" label="Photo (facultatif)" currentPath={product?.photoPath} errors={errors.photo} />
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" errors={errors.name} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="brand">
          Marque <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} autoComplete="off" />
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sizeValue">Contenance</Label>
          <Input
            id="sizeValue"
            name="sizeValue"
            inputMode="numeric"
            className="font-mono"
            value={sizeValue}
            onChange={(event) => setSizeValue(event.target.value)}
            aria-invalid={errors.sizeValue ? true : undefined}
            aria-describedby={errors.sizeValue || errors.sizeUnit ? "sizeValue-error" : "sizeValue-help"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sizeUnit">Unité</Label>
          <select
            id="sizeUnit"
            name="sizeUnit"
            value={sizeUnit}
            onChange={(event) => setSizeUnit(event.target.value as SizeUnit)}
            className={selectClass}
            aria-invalid={errors.sizeUnit ? true : undefined}
          >
            <option value="G">g</option>
            <option value="ML">ml</option>
            <option value="PIECE">pièces</option>
          </select>
        </div>
        <div className="col-span-2 -mt-1">
          <FieldError id="sizeValue-error" errors={errors.sizeValue ?? errors.sizeUnit} />
          {!errors.sizeValue && !errors.sizeUnit && (
            <p id="sizeValue-help" className="text-xs text-muted-foreground">
              En grammes, millilitres ou pièces : 1,5 kg = 1500 g.
            </p>
          )}
        </div>
      </div>
      {priceLabel && (
        <div className="grid gap-1.5">
          <Label htmlFor="price">{priceLabel}</Label>
          <Input
            id="price"
            inputMode="decimal"
            className="font-mono"
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
              priceRef.current = parseEuros(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">{perMeasure}</p>
        </div>
      )}
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
