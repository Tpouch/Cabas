import { stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getProduct, listProducts } from "@/server/repositories/products";
import { createProductAction, deleteProductAction, updateProductAction } from "./products";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const penne = { name: "Penne Rigate", brand: "Barilla", sizeValue: "500", sizeUnit: "G" };

async function photo(): Promise<File> {
  const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#f5ebdd" } }).jpeg().toBuffer();
  return new File([new Uint8Array(buffer)], "penne.jpg", { type: "image/jpeg" });
}

async function storeId(name: string): Promise<string> {
  const store = await db().store.create({ data: { name, nameKey: name.toLowerCase() } });
  return store.id;
}

describe("product actions", () => {
  it("creates a product with its photo", async () => {
    const result = await createProductAction(null, form({ ...penne, photo: await photo() }));
    expect(result).toMatchObject({
      ok: true,
      data: { name: "Penne Rigate", brand: "Barilla", sizeValue: 500, sizeUnit: "G", bestPriceCents: null },
    });
    if (!result.ok) return;
    expect(result.data.photoPath).toMatch(/^products\/.+\.webp$/);
  });

  it.each([
    [{ sizeValue: "" }, "sizeValue", "Indique la contenance."],
    [{ sizeValue: "1e3" }, "sizeValue", "Indique la contenance en chiffres."],
    [{ sizeValue: "2000000" }, "sizeValue", "La contenance doit être inférieure à 1 000 000."],
    [{ sizeValue: "0" }, "sizeValue", "La contenance doit être supérieure à 0."],
    [{ sizeValue: "1,5" }, "sizeValue", "La contenance doit être un nombre entier (ex. 1500 pour 1,5 kg)."],
    [{ sizeValue: "abc" }, "sizeValue", "Indique la contenance en chiffres."],
    [{ sizeUnit: "KG" }, "sizeUnit", "Choisis une unité."],
    [{ name: " " }, "name", "Indique le nom du produit."],
  ])("rejects %j", async (override, field, message) => {
    const result = await createProductAction(null, form({ ...penne, ...override }));
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await listProducts()).toHaveLength(0);
  });

  it("lists products with their best known price and filters by name or brand", async () => {
    const created = await createProductAction(null, form(penne));
    await createProductAction(null, form({ name: "Lait demi-écrémé", brand: "Lactel", sizeValue: "1000", sizeUnit: "ML" }));
    if (!created.ok) throw new Error("setup failed");
    const day = new Date("2026-10-01");
    await db().priceObservation.createMany({
      data: [
        { productId: created.data.id, storeId: await storeId("Lidl"), priceCents: 99, observedAt: day, source: "MANUAL" },
        { productId: created.data.id, storeId: await storeId("Leclerc"), priceCents: 115, observedAt: day, source: "MANUAL" },
      ],
    });

    const all = await listProducts();
    expect(all.map((p) => [p.name, p.bestPriceCents])).toEqual([
      ["Lait demi-écrémé", null],
      ["Penne Rigate", 99],
    ]);
    expect((await listProducts("barilla")).map((p) => p.name)).toEqual(["Penne Rigate"]);
    expect((await listProducts("LAIT")).map((p) => p.name)).toEqual(["Lait demi-écrémé"]);
  });

  it("updates a product", async () => {
    const created = await createProductAction(null, form(penne));
    if (!created.ok) throw new Error("setup failed");
    const result = await updateProductAction(created.data.id, null, form({ ...penne, sizeValue: "1000", brand: "" }));
    expect(result).toMatchObject({ ok: true, data: { sizeValue: 1000, brand: null } });
  });

  it("deletes a product with its photo and prices", async () => {
    const created = await createProductAction(null, form({ ...penne, photo: await photo() }));
    if (!created.ok || !created.data.photoPath) throw new Error("setup failed");
    await db().priceObservation.create({
      data: { productId: created.data.id, storeId: await storeId("Lidl"), priceCents: 99, observedAt: new Date(), source: "MANUAL" },
    });
    expect(await deleteProductAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await getProduct(created.data.id)).toBeNull();
    expect(await db().priceObservation.count()).toBe(0);
    await expect(stat(join(process.env.UPLOADS_DIR as string, created.data.photoPath))).rejects.toThrow();
  });
});

describe("malformed ids", () => {
  it("treats a malformed id as not found", async () => {
    expect(await getProduct("not-a-uuid")).toBeNull();
  });
});

describe("photo replacement", () => {
  it("keeps the new photo when the old one cannot be deleted", async () => {
    const { mkdir, rm } = await import("node:fs/promises");
    const created = await createProductAction(null, form({ ...penne, photo: await photo() }));
    if (!created.ok || !created.data.photoPath) throw new Error("setup failed");
    // Make deleting the old file fail: replace it with a directory of the same name.
    const oldFile = join(process.env.UPLOADS_DIR as string, created.data.photoPath);
    await rm(oldFile);
    await mkdir(oldFile);

    const result = await updateProductAction(created.data.id, null, form({ ...penne, photo: await photo() }));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data.photoPath) return;
    expect(result.data.photoPath).not.toBe(created.data.photoPath);
    await expect(stat(join(process.env.UPLOADS_DIR as string, result.data.photoPath))).resolves.toBeTruthy();
  });
});
