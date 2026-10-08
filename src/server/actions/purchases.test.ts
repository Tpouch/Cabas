import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getPurchase } from "@/server/repositories/purchases";
import { createPurchaseAction, deletePurchaseAction, updatePurchaseAction } from "./purchases";

const uploads = () => process.env.UPLOADS_DIR as string;

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function receipt(): Promise<File> {
  const buffer = await sharp({ create: { width: 800, height: 2000, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  return new File([new Uint8Array(buffer)], "ticket.jpg", { type: "image/jpeg" });
}

async function receiptFiles(): Promise<string[]> {
  return readdir(join(uploads(), "receipts")).catch(() => []);
}

async function setup() {
  const store = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  const fields = {
    storeId: store.id,
    purchasedAt: "2026-10-03",
    total: "4,97",
    lines: JSON.stringify([
      { productId: penne.id, quantity: 2, unitPriceCents: 99 },
      { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
    ]),
  };
  return { store, penne, apples, fields };
}

describe("createPurchaseAction", () => {
  it("records a purchase with its receipt", async () => {
    const { fields } = await setup();
    const result = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const purchase = await getPurchase(result.data.id);
    expect(purchase).toMatchObject({ totalCents: 497 });
    expect(purchase?.receiptPath).toMatch(/^receipts\/.+\.webp$/);
    expect(purchase?.items.map((i) => i.quantity)).toEqual([2, 1.2]);
  });

  it.each([
    [{ storeId: "" }, "storeId", "Choisis un magasin."],
    [{ purchasedAt: "2999-01-01" }, "purchasedAt", "La date ne peut pas être dans le futur."],
    [{ total: "" }, "total", "Indique le total payé, par exemple 23,47."],
    [{ lines: "[]" }, "lines", "Ajoute au moins un article."],
    [{ lines: "not json" }, "lines", "Vérifie la quantité et le prix de chaque article."],
    [{ lines: JSON.stringify([{ productId: "01999999-0000-7000-8000-000000000000", quantity: 0, unitPriceCents: 99 }]) }, "lines", "Vérifie la quantité et le prix de chaque article."],
  ])("rejects %j", async (override, field, message) => {
    const { fields } = await setup();
    const result = await createPurchaseAction(null, form({ ...fields, ...override }));
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await db().purchase.count()).toBe(0);
  });

  it("refuses more than 500 lines", async () => {
    const { fields } = await setup();
    const line = { productId: "01999999-0000-7000-8000-000000000000", quantity: 1, unitPriceCents: 1 };
    const result = await createPurchaseAction(null, form({ ...fields, lines: JSON.stringify(Array(501).fill(line)) }));
    expect(result).toMatchObject({ ok: false, errors: { lines: ["Une course ne peut pas dépasser 500 articles."] } });
  });

  it("rejects a receipt that is not an image", async () => {
    const { fields } = await setup();
    const fake = new File([new TextEncoder().encode("%PDF-1.7")], "ticket.jpg", { type: "image/jpeg" });
    const result = await createPurchaseAction(null, form({ ...fields, receipt: fake }));
    expect(result).toMatchObject({ ok: false, errors: { receipt: ["Ce fichier n'est pas une image JPEG, PNG ou WebP."] } });
    expect(await db().purchase.count()).toBe(0);
  });

  it("explains that a product was deleted meanwhile and keeps no receipt file", async () => {
    const { fields, apples } = await setup();
    await db().product.delete({ where: { id: apples.id } });
    const before = await receiptFiles();
    const result = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    expect(result).toMatchObject({ ok: false, message: "Un magasin ou un produit de cette course n'existe plus." });
    expect(await receiptFiles()).toEqual(before);
  });
});

describe("updatePurchaseAction", () => {
  it("replaces the receipt and removes the old file", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    const before = await getPurchase(created.data.id);

    const result = await updatePurchaseAction(created.data.id, null, form({ ...fields, total: "5,00", receipt: await receipt() }));
    expect(result).toEqual({ ok: true, data: { id: created.data.id } });
    const after = await getPurchase(created.data.id);
    expect(after?.totalCents).toBe(500);
    expect(after?.receiptPath).not.toBe(before?.receiptPath);
    await expect(stat(join(uploads(), before?.receiptPath as string))).rejects.toThrow();
  });

  it("keeps the receipt when none is sent", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    const before = await getPurchase(created.data.id);
    await updatePurchaseAction(created.data.id, null, form(fields));
    expect((await getPurchase(created.data.id))?.receiptPath).toBe(before?.receiptPath);
  });

  it.each(["01999999-0000-7000-8000-000000000000", "abc"])("reports purchase %s as gone", async (id) => {
    const { fields } = await setup();
    expect(await updatePurchaseAction(id, null, form(fields))).toMatchObject({ ok: false, message: "Cette course n'existe plus." });
  });
});

describe("deletePurchaseAction", () => {
  it("deletes the purchase and its receipt, then reports it as gone", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    const { receiptPath } = (await getPurchase(created.data.id)) ?? {};
    expect(await deletePurchaseAction(created.data.id)).toEqual({ ok: true, data: null });
    await expect(stat(join(uploads(), receiptPath as string))).rejects.toThrow();
    expect(await deletePurchaseAction(created.data.id)).toMatchObject({ ok: false, message: "Cette course n'existe plus." });
  });
});

describe("promotions", () => {
  async function withPromo(promo: unknown, unitPriceCents = 120) {
    const { fields, penne } = await setup();
    return createPurchaseAction(
      null,
      form({ ...fields, total: "2,40", lines: JSON.stringify([{ productId: penne.id, quantity: 3, unitPriceCents, promo }]) }),
    );
  }

  it("records a line's promotion", async () => {
    const result = await withPromo({ kind: "BUY_GET_FREE", buy: 2, free: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await getPurchase(result.data.id))?.items[0]?.promo).toEqual({ kind: "BUY_GET_FREE", buy: 2, free: 1 });
  });

  it.each([
    [{ kind: "PERCENT_OFF", percent: 0 }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "PERCENT_OFF", percent: 101 }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "PERCENT_OFF", percent: null }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "NTH_PERCENT_OFF", nth: 1, percent: 60 }, "Indique un rang entre 2 et 10."],
    [{ kind: "BUY_GET_FREE", buy: 0, free: 1 }, "Indique un nombre d’articles entre 1 et 20."],
    [{ kind: "BUY_GET_FREE", buy: 2, free: null }, "Indique un nombre d’articles entre 1 et 20."],
    [{ kind: "AMOUNT_OFF_PER_UNIT", amountCents: null }, "Indique la remise par article, par exemple 0,50."],
    [{ kind: "AMOUNT_OFF_PER_UNIT", amountCents: 121 }, "La remise dépasse le prix de l’article."],
    [{ kind: "BOGO" }, "Vérifie la quantité et le prix de chaque article."],
    [{ kind: "PERCENT_OFF", percent: 30, buy: 2 }, "Vérifie la quantité et le prix de chaque article."],
  ])("refuses %j", async (promo, message) => {
    const result = await withPromo(promo);
    expect(result).toMatchObject({ ok: false, errors: { lines: [message] } });
    expect(await db().purchase.count()).toBe(0);
  });
});
