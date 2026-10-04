import { describe, expect, it } from "vitest";
import { isEmptyDraft, parseDraft, type PurchaseDraft, purchaseToDraft, serializeDraft } from "./purchase-draft";

const known = { storeIds: new Set(["lidl"]), productIds: new Set(["penne", "pommes"]) };

const draft: PurchaseDraft = {
  storeId: "lidl",
  purchasedAt: "2026-10-03",
  lines: [
    { key: "a", productId: "penne", quantity: "2", unitPrice: "0,99" },
    { key: "b", productId: "pommes", quantity: "1,", unitPrice: "" },
  ],
  total: "4,97",
  totalEdited: true,
};

describe("purchase draft", () => {
  it("round-trips a draft, half-typed values included", () => {
    expect(parseDraft(serializeDraft(draft), known)).toEqual(draft);
  });

  it.each([null, "", "not json", "42", JSON.stringify({ storeId: 3 }), JSON.stringify({ ...draft, lines: "x" })])(
    "ignores unreadable content %j",
    (raw) => {
      expect(parseDraft(raw, known)).toBeNull();
    },
  );

  it("drops lines whose product was deleted and forgets a deleted store", () => {
    const restored = parseDraft(serializeDraft(draft), { storeIds: new Set(), productIds: new Set(["penne"]) });
    expect(restored?.storeId).toBeNull();
    expect(restored?.lines.map((l) => l.productId)).toEqual(["penne"]);
  });

  it("knows when a draft holds nothing worth restoring", () => {
    expect(isEmptyDraft({ storeId: null, purchasedAt: "2026-10-03", lines: [], total: "", totalEdited: false })).toBe(true);
    expect(isEmptyDraft(draft)).toBe(false);
  });
});

describe("purchaseToDraft", () => {
  it("turns a saved purchase into editable values", () => {
    const purchase = {
      id: "p1",
      purchasedAt: new Date("2026-10-03T00:00:00.000Z"),
      totalCents: 497,
      receiptPath: null,
      store: { id: "lidl", name: "Lidl", address: null, logoPath: null },
      items: [
        {
          id: "i1",
          quantity: 1.2,
          unitPriceCents: 249,
          product: { id: "pommes", name: "Pommes", brand: null, photoPath: null, sizeValue: 1000, sizeUnit: "G" as const },
        },
      ],
    };
    expect(purchaseToDraft(purchase)).toEqual({
      storeId: "lidl",
      purchasedAt: "2026-10-03",
      lines: [{ key: "i1", productId: "pommes", quantity: "1,2", unitPrice: "2,49" }],
      total: "4,97",
      totalEdited: true,
    });
  });
});
