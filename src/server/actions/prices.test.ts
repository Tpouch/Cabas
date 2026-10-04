import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listStorePrices } from "@/server/repositories/prices";
import { addPriceAction } from "./prices";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function setup() {
  const product = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const [lidl, auchan] = await Promise.all(
    ["Lidl", "Auchan"].map((name) => db().store.create({ data: { name, nameKey: name.toLowerCase() } })),
  );
  if (!lidl || !auchan) throw new Error("setup failed");
  return { product, lidl, auchan };
}

describe("addPriceAction", () => {
  it("adds a manual price and updates the cheapest store", async () => {
    const { product, lidl, auchan } = await setup();
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,99", observedAt: "2026-10-01" }));
    const result = await addPriceAction(product.id, null, form({ storeId: auchan.id, price: "0,95 €", observedAt: "2026-10-02" }));
    expect(result).toEqual({ ok: true, data: null });

    const rows = await listStorePrices(product.id);
    expect(rows.map((r) => [r.store.name, r.priceCents, r.isCheapest])).toEqual([
      ["Auchan", 95, true],
      ["Lidl", 99, false],
    ]);
    expect(await db().priceObservation.findFirst({ where: { storeId: auchan.id } })).toMatchObject({ source: "MANUAL" });
  });

  it("shows only the latest price of a store", async () => {
    const { product, lidl } = await setup();
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,89", observedAt: "2026-09-01" }));
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,99", observedAt: "2026-10-01" }));
    expect((await listStorePrices(product.id)).map((r) => r.priceCents)).toEqual([99]);
  });

  it.each([
    [{ price: "abc" }, "price", "Indique un prix valide, par exemple 1,29."],
    [{ price: "0" }, "price", "Indique un prix valide, par exemple 1,29."],
    [{ price: "100000" }, "price", "Le prix doit être inférieur à 100 000 €."],
    [{ observedAt: "2999-01-01" }, "observedAt", "La date ne peut pas être dans le futur."],
    [{ storeId: "" }, "storeId", "Choisis un magasin."],
    [{ observedAt: "03/10/2026" }, "observedAt", "Indique une date valide."],
  ])("rejects %j", async (override, field, message) => {
    const { product, lidl } = await setup();
    const result = await addPriceAction(
      product.id,
      null,
      form({ storeId: lidl.id, price: "1,29", observedAt: "2026-10-01", ...override }),
    );
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await db().priceObservation.count()).toBe(0);
  });

  it("reports a store that no longer exists", async () => {
    const { product } = await setup();
    const result = await addPriceAction(
      product.id,
      null,
      form({ storeId: "01999999-0000-7000-8000-000000000000", price: "1,29", observedAt: "2026-10-01" }),
    );
    expect(result).toMatchObject({ ok: false, errors: { storeId: ["Ce magasin n'existe plus."] } });
  });
});

describe("listStorePrices", () => {
  it("returns no prices for a malformed product id", async () => {
    expect(await listStorePrices("not-a-uuid")).toEqual([]);
  });
});
