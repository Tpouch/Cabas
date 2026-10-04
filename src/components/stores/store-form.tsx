"use client";

import { FieldError } from "@/components/common/field-error";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { StoreSummary } from "@/server/repositories/stores";

type Props = {
  action: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  store?: StoreSummary;
  defaultName?: string;
  onDone: (store: StoreSummary) => void;
};

export function StoreForm({ action, store, defaultName, onDone }: Props) {
  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, onDone);

  return (
    <form ref={formRef} className="grid gap-4" noValidate onSubmit={onSubmit}>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={store?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" errors={errors.name} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">
          Adresse <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input id="address" name="address" defaultValue={store?.address ?? ""} autoComplete="street-address" />
      </div>
      <ImageField name="logo" label="Logo (facultatif)" currentPath={store?.logoPath} errors={errors.logo} />
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
