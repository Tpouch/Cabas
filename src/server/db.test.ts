import { describe, expect, it } from "vitest";
import { db } from "./db";

describe("database", () => {
  it("stores a product with its size in base units", async () => {
    const created = await db().product.create({
      data: { name: "Penne Rigate", brand: "Barilla", sizeValue: 500, sizeUnit: "G" },
    });
    const found = await db().product.findUniqueOrThrow({ where: { id: created.id } });
    expect(found).toMatchObject({ name: "Penne Rigate", sizeValue: 500, sizeUnit: "G" });
  });

  it("starts each test with empty tables", async () => {
    expect(await db().product.count()).toBe(0);
  });
});
