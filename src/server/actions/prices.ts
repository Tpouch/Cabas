"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { addManualPrice, UnknownStoreError } from "@/server/repositories/prices";
import { productExists } from "@/server/repositories/products";
import { text } from "./form-data";
import { priceInputSchema } from "./prices.schema";
import { type ActionResult, type ActionState, failure, invalid } from "./result";

export async function addPriceAction(
  productId: string,
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionResult<null>> {
  await requireSession();
  const parsed = priceInputSchema.safeParse({
    storeId: text(formData, "storeId"),
    price: text(formData, "price"),
    observedAt: text(formData, "observedAt"),
  });
  if (!parsed.success) return invalid(parsed.error);
  if (!(await productExists(productId))) return failure("Ce produit n'existe plus.");
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
