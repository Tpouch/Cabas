"use server";

import { revalidatePath } from "next/cache";
import {
  createStore,
  deleteStore,
  DuplicateStoreError,
  getStore,
  StoreInUseError,
  StoreNotFoundError,
  type StoreSummary,
  updateStore,
} from "@/server/repositories/stores";
import { deleteImage, discardImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { type ActionResult, type ActionState, failure, invalid } from "./result";
import { storeInputSchema } from "./stores.schema";

const DUPLICATE = { name: ["Ce magasin existe déjà."] };

async function saveLogo(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "logo");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "stores") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

export async function createStoreAction(
  _prev: ActionState<StoreSummary>,
  formData: FormData,
): Promise<ActionResult<StoreSummary>> {
  const parsed = storeInputSchema.safeParse({ name: text(formData, "name"), address: text(formData, "address") });
  if (!parsed.success) return invalid(parsed.error);

  const logo = await saveLogo(formData);
  if ("error" in logo) return { ok: false, errors: { logo: [logo.error] } };

  try {
    const store = await createStore({ ...parsed.data, logoPath: logo.path });
    revalidatePath("/stores");
    return { ok: true, data: store };
  } catch (error) {
    await deleteImage(logo.path);
    if (error instanceof DuplicateStoreError) return { ok: false, errors: DUPLICATE };
    throw error;
  }
}

export async function updateStoreAction(
  id: string,
  _prev: ActionState<StoreSummary>,
  formData: FormData,
): Promise<ActionResult<StoreSummary>> {
  const parsed = storeInputSchema.safeParse({ name: text(formData, "name"), address: text(formData, "address") });
  if (!parsed.success) return invalid(parsed.error);

  const existing = await getStore(id);
  if (!existing) return failure("Ce magasin n'existe plus.");

  const logo = await saveLogo(formData);
  if ("error" in logo) return { ok: false, errors: { logo: [logo.error] } };

  let store: StoreSummary;
  try {
    store = await updateStore(id, { ...parsed.data, logoPath: logo.path ?? existing.logoPath });
  } catch (error) {
    await deleteImage(logo.path);
    if (error instanceof DuplicateStoreError) return { ok: false, errors: DUPLICATE };
    throw error;
  }
  if (logo.path) await discardImage(existing.logoPath);
  revalidatePath("/stores");
  return { ok: true, data: store };
}

export async function deleteStoreAction(id: string): Promise<ActionResult<null>> {
  try {
    const store = await deleteStore(id);
    await deleteImage(store.logoPath);
    revalidatePath("/stores");
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof StoreInUseError) {
      return failure("Ce magasin est utilisé par des prix ou des courses : il ne peut pas être supprimé.");
    }
    if (error instanceof StoreNotFoundError) return failure("Ce magasin n'existe plus.");
    throw error;
  }
}
