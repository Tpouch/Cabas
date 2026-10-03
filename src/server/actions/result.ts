import { z } from "zod";

export type FieldErrors = Partial<Record<string, string[]>>;
export type ActionResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors; message?: string };
export type ActionState<T> = ActionResult<T> | null;

export function invalid(error: z.ZodError): { ok: false; errors: FieldErrors } {
  return { ok: false, errors: z.flattenError(error).fieldErrors as FieldErrors };
}

export function failure(message: string, errors: FieldErrors = {}): { ok: false; errors: FieldErrors; message: string } {
  return { ok: false, errors, message };
}
