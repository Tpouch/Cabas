"use client";

import { FieldError } from "@/components/common/field-error";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";

type Props = {
  action: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
  product?: ProductSummary;
  defaultName?: string;
  onDone: (product: ProductSummary) => void;
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProductForm({ action, product, defaultName, onDone }: Props) {
  const { state, errors, pending, onSubmit } = useFormAction(action, onDone);

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <ImageField name="photo" label="Photo (facultatif)" currentPath={product?.photoPath} errors={errors.photo} capture />
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby="name-error"
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
            defaultValue={product?.sizeValue ?? ""}
            aria-invalid={errors.sizeValue ? true : undefined}
            aria-describedby="sizeValue-error"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sizeUnit">Unité</Label>
          <select
            id="sizeUnit"
            name="sizeUnit"
            defaultValue={product?.sizeUnit ?? "G"}
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
            <p className="text-xs text-muted-foreground">En grammes, millilitres ou pièces : 1,5 kg = 1500 g.</p>
          )}
        </div>
      </div>
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
