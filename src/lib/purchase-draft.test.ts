import { describe, expect, it } from "vitest";
import type { Promo } from "@/domain/promo";
import {
  draftLineAmounts,
  draftLinePayload,
  type DraftPromo,
  emptyDraftPromo,
  isEmptyDraft,
  parseDraft,
  promoToDraft,
  type PurchaseDraft,
  purchaseToDraft,
  readDraftPromo,
  serializeDraft,
} from "./purchase-draft";

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
          promo: null,
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

const twoPlusOne: DraftPromo = { ...emptyDraftPromo(), kind: "BUY_GET_FREE", buy: "2", free: "1" };

describe("draft promotions", () => {
  it("round-trips a line with a half-typed promotion", () => {
    const withPromo: PurchaseDraft = { ...draft, lines: [{ ...draft.lines[0]!, promo: { ...twoPlusOne, free: "" } }] };
    expect(parseDraft(serializeDraft(withPromo), known)).toEqual(withPromo);
  });

  it("restores a draft saved before promotions existed", () => {
    expect(parseDraft(serializeDraft(draft), known)?.lines[0]?.promo).toBeUndefined();
  });

  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 },
    { kind: "PERCENT_OFF", percent: 30 },
    { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 },
    { kind: "BUY_GET_FREE", buy: 2, free: 1 },
  ])("reads back %j from its typed values", (promo) => {
    expect(readDraftPromo(promoToDraft(promo), 120)).toEqual(promo);
  });

  it.each<[string, DraftPromo]>([
    ["a missing value", { ...twoPlusOne, free: "" }],
    ["an unreadable value", { ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "abc" }],
    ["an out-of-range value", { ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "150" }],
    ["a discount above the price", { ...emptyDraftPromo(), amount: "1,50" }],
  ])("gives no promotion while there is %s", (_, promo) => {
    expect(readDraftPromo(promo, 120)).toBeNull();
  });

  it("sends the typed numbers, null when unreadable, so the server can explain", () => {
    expect(
      draftLinePayload({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20", promo: { ...twoPlusOne, free: "x" } }),
    ).toEqual({
      productId: "penne",
      quantity: 3,
      unitPriceCents: 120,
      promo: { kind: "BUY_GET_FREE", buy: 2, free: null },
    });
    expect(draftLinePayload({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20" })).toEqual({
      productId: "penne",
      quantity: 3,
      unitPriceCents: 120,
    });
  });

  it("computes a line only once quantity and price are readable", () => {
    expect(draftLineAmounts({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20", promo: twoPlusOne })).toEqual({
      quantity: 3,
      unitPriceCents: 120,
      promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 },
    });
    expect(draftLineAmounts({ key: "a", productId: "penne", quantity: "3", unitPrice: "" })).toBeNull();
  });

  it("turns a saved promotion into editable values", () => {
    const purchase = {
      id: "p1",
      purchasedAt: new Date("2026-10-03T00:00:00.000Z"),
      totalCents: 240,
      receiptPath: null,
      store: { id: "lidl", name: "Lidl", address: null, logoPath: null },
      items: [
        {
          id: "i1",
          quantity: 3,
          unitPriceCents: 120,
          promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } as const,
          product: { id: "penne", name: "Penne", brand: null, photoPath: null, sizeValue: 500, sizeUnit: "G" as const },
        },
      ],
    };
    expect(purchaseToDraft(purchase).lines[0]?.promo).toEqual(twoPlusOne);
  });
});
