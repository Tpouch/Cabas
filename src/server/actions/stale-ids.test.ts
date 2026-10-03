import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addAlternativeAction } from "./alternatives";
import { addPriceAction } from "./prices";
import { deleteProductAction, updateProductAction } from "./products";
import { deleteStoreAction, updateStoreAction } from "./stores";

// Records deleted from another device (phone + PC open on the same data) or malformed ids.
const GONE = "01999999-0000-7000-8000-000000000000";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function product(name = "Penne") {
  return db().product.create({ data: { name, sizeValue: 500, sizeUnit: "G" } });
}

describe("actions on records that no longer exist", () => {
  it.each([GONE, "abc"])("deleting store %s says it no longer exists", async (id) => {
    expect(await deleteStoreAction(id)).toMatchObject({ ok: false, message: "Ce magasin n'existe plus." });
  });

  it.each([GONE, "abc"])("updating store %s says it no longer exists", async (id) => {
    expect(await updateStoreAction(id, null, form({ name: "Lidl", address: "" }))).toMatchObject({
      ok: false,
      message: "Ce magasin n'existe plus.",
    });
  });

  it.each([GONE, "abc"])("deleting product %s says it no longer exists", async (id) => {
    expect(await deleteProductAction(id)).toMatchObject({ ok: false, message: "Ce produit n'existe plus." });
  });

  it.each([GONE, "abc"])("updating product %s says it no longer exists", async (id) => {
    const result = await updateProductAction(id, null, form({ name: "Penne", brand: "", sizeValue: "500", sizeUnit: "G" }));
    expect(result).toMatchObject({ ok: false, message: "Ce produit n'existe plus." });
  });

  it.each([GONE, "abc"])("linking alternative %s says the product no longer exists", async (id) => {
    const penne = await product();
    expect(await addAlternativeAction(penne.id, id)).toMatchObject({ ok: false, message: "Ce produit n'existe plus." });
  });

  it.each([GONE, "abc"])("adding a price to product %s says the product no longer exists", async (id) => {
    const store = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
    const result = await addPriceAction(id, null, form({ storeId: store.id, price: "1,29", observedAt: "2026-10-01" }));
    expect(result).toMatchObject({ ok: false, message: "Ce produit n'existe plus." });
    expect(await db().priceObservation.count()).toBe(0);
  });
});
