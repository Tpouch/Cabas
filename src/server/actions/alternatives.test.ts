import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listAlternativeCandidates, listAlternatives } from "@/server/repositories/alternatives";
import { addAlternativeAction, removeAlternativeAction } from "./alternatives";

async function product(name: string) {
  return db().product.create({ data: { name, sizeValue: 500, sizeUnit: "G" } });
}

describe("alternatives", () => {
  it("links two products both ways with a single row", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    expect(await addAlternativeAction(penne.id, combino.id)).toEqual({ ok: true, data: null });
    expect((await listAlternatives(penne.id)).map((p) => p.name)).toEqual(["Combino"]);
    expect((await listAlternatives(combino.id)).map((p) => p.name)).toEqual(["Penne"]);
    expect(await db().productAlternative.count()).toBe(1);
  });

  it("ignores a link that already exists in either direction", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    expect(await addAlternativeAction(combino.id, penne.id)).toEqual({ ok: true, data: null });
    expect(await db().productAlternative.count()).toBe(1);
  });

  it("refuses to make a product its own alternative", async () => {
    const penne = await product("Penne");
    expect(await addAlternativeAction(penne.id, penne.id)).toMatchObject({
      ok: false,
      message: "Un produit ne peut pas être sa propre alternative.",
    });
  });

  it("removes a link from either side", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    await removeAlternativeAction(combino.id, penne.id);
    expect(await listAlternatives(penne.id)).toEqual([]);
  });

  it("drops the link when a product is deleted", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    await db().product.delete({ where: { id: combino.id } });
    expect(await listAlternatives(penne.id)).toEqual([]);
  });
});

describe("alternative candidates", () => {
  it("offers every other product that is not already linked, by name, without prices", async () => {
    const [penne, combino, riz, lait] = [
      await product("Penne"),
      await product("Combino"),
      await product("Riz"),
      await product("Lait"),
    ];
    await addAlternativeAction(penne.id, combino.id);
    const candidates = await listAlternativeCandidates(penne.id);
    expect(candidates).toEqual([
      { id: lait.id, name: "Lait", brand: null, photoPath: null },
      { id: riz.id, name: "Riz", brand: null, photoPath: null },
    ]);
  });

  it("offers nothing for a malformed id", async () => {
    expect(await listAlternativeCandidates("abc")).toEqual([]);
  });
});
