"use client";

import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/result";

/** Runs a click-triggered Server Action and always tells the user how it went. */
export async function runAction<T>(action: Promise<ActionResult<T>>, successMessage: string): Promise<boolean> {
  try {
    const result = await action;
    if (result.ok) {
      toast.success(successMessage);
      return true;
    }
    toast.error(result.message ?? "L’action n’a pas pu aboutir.");
    return false;
  } catch {
    toast.error("L’action n’a pas pu aboutir. Réessaie dans un instant.");
    return false;
  }
}
