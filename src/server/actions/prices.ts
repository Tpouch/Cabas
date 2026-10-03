"use server";

import { revalidatePath } from "next/cache";
import { addManualPrice, UnknownStoreError } from "@/server/repositories/prices";
import { text } from "./form-data";
import { priceInputSchema } from "./prices.schema";
import { type ActionResult, type ActionState, invalid } from "./result";

export async function addPriceAction(
  productId: string,
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = priceInputSchema.safeParse({
    storeId: text(formData, "storeId"),
    price: text(formData, "price"),
    observedAt: text(formData, "observedAt"),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await addManualPrice({
      productId,
      storeId: parsed.data.storeId,
      priceCents: parsed.data.price,
      observedAt: parsed.data.observedAt,
    });
  } catch (error) {
    if (error instanceof UnknownStoreError) return { ok: false, errors: { storeId: ["Ce magasin n'existe plus."] } };
    throw error;
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true, data: null };
}
