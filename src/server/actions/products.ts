"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  deleteProduct,
  getProduct,
  ProductNotFoundError,
  type ProductSummary,
  updateProduct,
} from "@/server/repositories/products";
import { deleteImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { productInputSchema } from "./products.schema";
import { type ActionResult, type ActionState, failure, invalid } from "./result";

function parse(formData: FormData) {
  return productInputSchema.safeParse({
    name: text(formData, "name"),
    brand: text(formData, "brand"),
    sizeValue: text(formData, "sizeValue"),
    sizeUnit: text(formData, "sizeUnit"),
  });
}

async function savePhoto(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "photo");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "products") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

export async function createProductAction(
  _prev: ActionState<ProductSummary>,
  formData: FormData,
): Promise<ActionResult<ProductSummary>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const photo = await savePhoto(formData);
  if ("error" in photo) return { ok: false, errors: { photo: [photo.error] } };
  try {
    const product = await createProduct({ ...parsed.data, photoPath: photo.path });
    revalidatePath("/products");
    return { ok: true, data: product };
  } catch (error) {
    await deleteImage(photo.path);
    throw error;
  }
}

export async function updateProductAction(
  id: string,
  _prev: ActionState<ProductSummary>,
  formData: FormData,
): Promise<ActionResult<ProductSummary>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const existing = await getProduct(id);
  if (!existing) return failure("Ce produit n'existe plus.");
  const photo = await savePhoto(formData);
  if ("error" in photo) return { ok: false, errors: { photo: [photo.error] } };
  try {
    const product = await updateProduct(id, { ...parsed.data, photoPath: photo.path ?? existing.photoPath });
    if (photo.path) await deleteImage(existing.photoPath);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, data: product };
  } catch (error) {
    await deleteImage(photo.path);
    throw error;
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  let product: ProductSummary;
  try {
    product = await deleteProduct(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) return failure("Ce produit n'existe plus.");
    throw error;
  }
  await deleteImage(product.photoPath);
  revalidatePath("/products");
  return { ok: true, data: null };
}
