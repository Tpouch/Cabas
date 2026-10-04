"use client";

import { useCallback, useState } from "react";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { FieldError } from "@/components/common/field-error";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { StoreForm } from "@/components/stores/store-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEuros } from "@/domain/money";
import { formatPerMeasure } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";
import type { StoreSummary } from "@/server/repositories/stores";

type Props = {
  product: ProductSummary;
  stores: StoreSummary[];
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionResult<null>>;
  createStore: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  onDone: () => void;
  today: string;
};

export function PriceForm({ product, stores: initialStores, action, createStore, onDone, today }: Props) {
  const [stores, setStores] = useState(initialStores);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [observedAt, setObservedAt] = useState(today);
  const [newStoreName, setNewStoreName] = useState<string | null>(null);
  const done = useCallback(() => onDone(), [onDone]);
  const { errors, pending, onSubmit, formRef } = useFormAction(action, done);
  const cents = parseEuros(price);

  const storeCreated = useCallback((store: StoreSummary) => {
    setStores((current) => [...current, store].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    setStoreId(store.id);
    setNewStoreName(null);
  }, []);

  if (newStoreName !== null) {
    return (
      <div className="grid gap-3">
        <StoreForm action={createStore} defaultName={newStoreName} onDone={storeCreated} />
        <Button type="button" variant="ghost" onClick={() => setNewStoreName(null)}>
          Retour au prix
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} className="grid gap-4" noValidate onSubmit={onSubmit}>
      <EntityCombobox
        id="storeId"
        name="storeId"
        label="Magasin"
        placeholder="Choisir un magasin"
        options={stores.map((s) => ({
          id: s.id,
          label: s.name,
          imageUrl: s.logoPath ? uploadUrl(s.logoPath, { thumb: true }) : null,
        }))}
        value={storeId}
        onChange={setStoreId}
        onCreate={setNewStoreName}
        errors={errors.storeId}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="price">Prix</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            className="font-mono"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={errors.price ? "price-error" : undefined}
          />
          <p data-testid="per-measure" className="text-xs text-muted-foreground">
            {cents ? `= ${formatPerMeasure(cents, product.sizeValue, product.sizeUnit)}` : " "}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observedAt">Date</Label>
          <Input
            id="observedAt"
            name="observedAt"
            type="date"
            className="font-mono"
            value={observedAt}
            max={today}
            onChange={(e) => setObservedAt(e.target.value)}
            aria-invalid={errors.observedAt ? true : undefined}
            aria-describedby={errors.observedAt ? "observedAt-error" : undefined}
          />
        </div>
      </div>
      <FieldError id="price-error" errors={errors.price} />
      <FieldError id="observedAt-error" errors={errors.observedAt} />
      <SubmitButton pending={pending}>Ajouter</SubmitButton>
    </form>
  );
}
