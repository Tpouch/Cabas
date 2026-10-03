"use server";

import { revalidatePath } from "next/cache";
import { linkAlternative, SelfAlternativeError, unlinkAlternative } from "@/server/repositories/alternatives";
import { ProductNotFoundError } from "@/server/repositories/products";
import { type ActionResult, failure } from "./result";

function revalidate(...ids: string[]) {
  for (const id of ids) revalidatePath(`/products/${id}`);
}

export async function addAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>> {
  try {
    await linkAlternative(productId, otherId);
  } catch (error) {
    if (error instanceof SelfAlternativeError) return failure("Un produit ne peut pas être sa propre alternative.");
    if (error instanceof ProductNotFoundError) return failure("Ce produit n'existe plus.");
    throw error;
  }
  revalidate(productId, otherId);
  return { ok: true, data: null };
}

export async function removeAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>> {
  await unlinkAlternative(productId, otherId);
  revalidate(productId, otherId);
  return { ok: true, data: null };
}
