"use client";

import { type FormEvent, startTransition, useActionState, useEffect } from "react";
import type { ActionResult, ActionState, FieldErrors } from "@/server/actions/result";

type FormAction<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/** Submits through onSubmit so typed values survive a validation error (no automatic form reset). */
export function useFormAction<T>(action: FormAction<T>, onDone: (data: T) => void) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors: FieldErrors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) onDone(state.data);
  }, [state, onDone]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return { state, errors, pending, onSubmit };
}
