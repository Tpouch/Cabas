"use client";

import { FieldError } from "@/components/common/field-error";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";

type Props = {
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionResult<null>>;
  next: string;
};

export function LoginForm({ action, next }: Props) {
  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, () => {});

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 rounded-md border bg-card p-5">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" errors={errors.password} />
      </div>
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Se connecter</SubmitButton>
    </form>
  );
}
