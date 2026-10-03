"use client";

import { startTransition, useActionState, useEffect } from "react";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
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
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) onDone(state.data);
  }, [state, onDone]);

  // Submitting through onSubmit (instead of `action=`) keeps typed values after a validation error.
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={store?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          autoFocus={Boolean(errors.name)}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-sm text-destructive">
            {errors.name[0]}
          </p>
        )}
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
