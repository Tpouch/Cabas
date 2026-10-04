"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import {
  createPurchase,
  deletePurchase,
  PurchaseNotFoundError,
  UnknownReferenceError,
  updatePurchase,
} from "@/server/repositories/purchases";
import { deleteImage, discardImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { purchaseInputSchema } from "./purchases.schema";
import { type ActionResult, type ActionState, failure, invalid } from "./result";

const GONE = "Cette course n'existe plus.";
const REFERENCE_GONE = "Un magasin ou un produit de cette course n'existe plus.";

function parse(formData: FormData) {
  return purchaseInputSchema.safeParse({
    storeId: text(formData, "storeId"),
    purchasedAt: text(formData, "purchasedAt"),
    total: text(formData, "total"),
    lines: text(formData, "lines"),
  });
}

async function saveReceipt(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "receipt");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "receipts") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

/** Purchases change product prices and statistics everywhere. */
function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createPurchaseAction(
  _prev: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const receipt = await saveReceipt(formData);
  if ("error" in receipt) return { ok: false, errors: { receipt: [receipt.error] } };

  const { total, ...input } = parsed.data;
  try {
    const { id } = await createPurchase({ ...input, totalCents: total, receiptPath: receipt.path });
    revalidateAll();
    return { ok: true, data: { id } };
  } catch (error) {
    await deleteImage(receipt.path);
    if (error instanceof UnknownReferenceError) return failure(REFERENCE_GONE);
    throw error;
  }
}

export async function updatePurchaseAction(
  id: string,
  _prev: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const receipt = await saveReceipt(formData);
  if ("error" in receipt) return { ok: false, errors: { receipt: [receipt.error] } };

  const { total, ...input } = parsed.data;
  let previousReceiptPath: string | null;
  try {
    ({ previousReceiptPath } = await updatePurchase(id, { ...input, totalCents: total, receiptPath: receipt.path }));
  } catch (error) {
    await deleteImage(receipt.path);
    if (error instanceof PurchaseNotFoundError) return failure(GONE);
    if (error instanceof UnknownReferenceError) return failure(REFERENCE_GONE);
    throw error;
  }
  if (receipt.path) await discardImage(previousReceiptPath);
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deletePurchaseAction(id: string): Promise<ActionResult<null>> {
  await requireSession();
  let receiptPath: string | null;
  try {
    ({ receiptPath } = await deletePurchase(id));
  } catch (error) {
    if (error instanceof PurchaseNotFoundError) return failure(GONE);
    throw error;
  }
  await discardImage(receiptPath);
  revalidateAll();
  return { ok: true, data: null };
}
