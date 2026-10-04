import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listStores } from "@/server/repositories/stores";
import { createStoreAction, deleteStoreAction, updateStoreAction } from "./stores";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function logo(): Promise<File> {
  const buffer = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#0050aa" } }).png().toBuffer();
  return new File([new Uint8Array(buffer)], "logo.png", { type: "image/png" });
}

describe("store actions", () => {
  it("creates a store with its logo", async () => {
    const result = await createStoreAction(null, form({ name: " Lidl Lomme ", address: "Rue de Lille", logo: await logo() }));
    expect(result.ok).toBe(true);
    const [store] = await listStores();
    expect(store).toMatchObject({ name: "Lidl Lomme", address: "Rue de Lille" });
    expect(store?.logoPath).toMatch(/^stores\/.+\.webp$/);
  });

  it("requires a name", async () => {
    const result = await createStoreAction(null, form({ name: "  " }));
    expect(result).toEqual({ ok: false, errors: { name: ["Indique le nom du magasin."] } });
  });

  it("refuses a duplicate name regardless of case and spaces", async () => {
    await createStoreAction(null, form({ name: "Lidl Lomme" }));
    const result = await createStoreAction(null, form({ name: " lidl   LOMME" }));
    expect(result).toMatchObject({ ok: false, errors: { name: ["Ce magasin existe déjà."] } });
    expect(await listStores()).toHaveLength(1);
  });

  it("rejects a logo that is not an image and creates nothing", async () => {
    const fake = new File([new TextEncoder().encode("%PDF-1.7")], "logo.jpg", { type: "image/jpeg" });
    const result = await createStoreAction(null, form({ name: "Auchan", logo: fake }));
    expect(result).toMatchObject({ ok: false, errors: { logo: ["Ce fichier n'est pas une image JPEG, PNG ou WebP."] } });
    expect(await listStores()).toHaveLength(0);
  });

  it("updates a store", async () => {
    const created = await createStoreAction(null, form({ name: "Leclerc" }));
    if (!created.ok) throw new Error("setup failed");
    const result = await updateStoreAction(created.data.id, null, form({ name: "Leclerc Templeuve", address: "" }));
    expect(result).toMatchObject({ ok: true, data: { name: "Leclerc Templeuve", address: null } });
  });

  it("deletes an unused store", async () => {
    const created = await createStoreAction(null, form({ name: "Leclerc" }));
    if (!created.ok) throw new Error("setup failed");
    expect(await deleteStoreAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await listStores()).toHaveLength(0);
  });

  it("refuses to delete a store that has prices", async () => {
    const created = await createStoreAction(null, form({ name: "Lidl" }));
    if (!created.ok) throw new Error("setup failed");
    const product = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
    await db().priceObservation.create({
      data: { productId: product.id, storeId: created.data.id, priceCents: 99, observedAt: new Date(), source: "MANUAL" },
    });
    const result = await deleteStoreAction(created.data.id);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("ne peut pas être supprimé") });
    expect(await listStores()).toHaveLength(1);
  });
});

describe("store logo replacement and renaming", () => {
  it("refuses to rename a store to an existing name", async () => {
    await createStoreAction(null, form({ name: "Lidl Lomme" }));
    const other = await createStoreAction(null, form({ name: "Auchan" }));
    if (!other.ok) throw new Error("setup failed");
    const result = await updateStoreAction(other.data.id, null, form({ name: "LIDL lomme", address: "" }));
    expect(result).toMatchObject({ ok: false, errors: { name: ["Ce magasin existe déjà."] } });
  });

  it("keeps the new logo when the old one cannot be deleted", async () => {
    const { mkdir, rm, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const created = await createStoreAction(null, form({ name: "Lidl", logo: await logo() }));
    if (!created.ok || !created.data.logoPath) throw new Error("setup failed");
    const oldFile = join(process.env.UPLOADS_DIR as string, created.data.logoPath);
    await rm(oldFile);
    await mkdir(oldFile);

    const result = await updateStoreAction(created.data.id, null, form({ name: "Lidl", address: "", logo: await logo() }));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data.logoPath) return;
    await expect(stat(join(process.env.UPLOADS_DIR as string, result.data.logoPath))).resolves.toBeTruthy();
  });
});
