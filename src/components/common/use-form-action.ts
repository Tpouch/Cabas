"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionResult, ActionState, FieldErrors } from "@/server/actions/result";

type FormAction<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/** Submits through onSubmit so typed values survive a validation error (no automatic form reset). */
export function useFormAction<T>(action: FormAction<T>, onDone: (data: T) => void) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors: FieldErrors = state && !state.ok ? state.errors : {};
  const onDoneRef = useRef(onDone);
  const handled = useRef<ActionState<T>>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Fire once per successful result, even if the parent re-renders with a new callback.
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onDoneRef.current(state.data);
    }
    if (state && !state.ok) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return { state, errors, pending, onSubmit, formRef };
}
