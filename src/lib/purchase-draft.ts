import { z } from "zod";
import { formatEurosInput, parseEuros } from "@/domain/money";
import { isPromoValid, parsePromoNumber, type Promo, PROMO_KINDS } from "@/domain/promo";
import { formatQuantity, type LineAmounts, parseQuantity } from "@/domain/purchase";
import type { PurchaseDetail } from "@/server/repositories/purchases";

export const DRAFT_STORAGE_KEY = "cabas:purchase-draft:v1";

const draftPromoSchema = z.object({
  kind: z.enum(PROMO_KINDS),
  amount: z.string(),
  percent: z.string(),
  nth: z.string(),
  buy: z.string(),
  free: z.string(),
});

const draftLineSchema = z.object({
  key: z.string(),
  productId: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  promo: draftPromoSchema.optional(),
});

const draftSchema = z.object({
  storeId: z.string().nullable(),
  purchasedAt: z.string(),
  lines: z.array(draftLineSchema),
  total: z.string(),
  totalEdited: z.boolean(),
});

export type DraftPromo = z.infer<typeof draftPromoSchema>;
export type DraftLine = z.infer<typeof draftLineSchema>;
export type PurchaseDraft = z.infer<typeof draftSchema>;

export function serializeDraft(draft: PurchaseDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(
  raw: string | null,
  known: { storeIds: Set<string>; productIds: Set<string> },
): PurchaseDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return null;
  const draft = parsed.data;
  return {
    ...draft,
    storeId: draft.storeId && known.storeIds.has(draft.storeId) ? draft.storeId : null,
    lines: draft.lines.filter((line) => known.productIds.has(line.productId)),
  };
}

export function isEmptyDraft(draft: PurchaseDraft): boolean {
  return draft.storeId === null && draft.lines.length === 0 && draft.total.trim() === "";
}

export function purchaseToDraft(purchase: PurchaseDetail): PurchaseDraft {
  return {
    storeId: purchase.store.id,
    purchasedAt: purchase.purchasedAt.toISOString().slice(0, 10),
    lines: purchase.items.map((item) => ({
      key: item.id,
      productId: item.product.id,
      quantity: formatQuantity(item.quantity),
      unitPrice: formatEurosInput(item.unitPriceCents),
      ...(item.promo && { promo: promoToDraft(item.promo) }),
    })),
    total: formatEurosInput(purchase.totalCents),
    totalEdited: true,
  };
}
export function emptyDraftPromo(): DraftPromo {
  return { kind: "AMOUNT_OFF_PER_UNIT", amount: "", percent: "", nth: "2", buy: "", free: "" };
}

/** What the form sends: typed numbers, null when unreadable, so the server says what is wrong. */
function promoPayload(promo: DraftPromo): Record<string, string | number | null> {
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { kind: promo.kind, amountCents: parseEuros(promo.amount) };
    case "PERCENT_OFF":
      return { kind: promo.kind, percent: parsePromoNumber(promo.percent) };
    case "NTH_PERCENT_OFF":
      return { kind: promo.kind, nth: parsePromoNumber(promo.nth), percent: parsePromoNumber(promo.percent) };
    case "BUY_GET_FREE":
      return { kind: promo.kind, buy: parsePromoNumber(promo.buy), free: parsePromoNumber(promo.free) };
  }
}

function toPromo(promo: DraftPromo): Promo | null {
  const percent = parsePromoNumber(promo.percent);
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT": {
      const amountCents = parseEuros(promo.amount);
      return amountCents === null ? null : { kind: promo.kind, amountCents };
    }
    case "PERCENT_OFF":
      return percent === null ? null : { kind: promo.kind, percent };
    case "NTH_PERCENT_OFF": {
      const nth = parsePromoNumber(promo.nth);
      return nth === null || percent === null ? null : { kind: promo.kind, nth, percent };
    }
    case "BUY_GET_FREE": {
      const buy = parsePromoNumber(promo.buy);
      const free = parsePromoNumber(promo.free);
      return buy === null || free === null ? null : { kind: promo.kind, buy, free };
    }
  }
}

/** The promotion to compute with, or null while a value is missing or out of range. */
export function readDraftPromo(promo: DraftPromo, unitPriceCents: number): Promo | null {
  const candidate = toPromo(promo);
  return candidate && isPromoValid(candidate, unitPriceCents) ? candidate : null;
}

export function promoToDraft(promo: Promo): DraftPromo {
  const draft = { ...emptyDraftPromo(), kind: promo.kind };
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { ...draft, amount: formatEurosInput(promo.amountCents) };
    case "PERCENT_OFF":
      return { ...draft, percent: String(promo.percent) };
    case "NTH_PERCENT_OFF":
      return { ...draft, nth: String(promo.nth), percent: String(promo.percent) };
    case "BUY_GET_FREE":
      return { ...draft, buy: String(promo.buy), free: String(promo.free) };
  }
}

export function draftLinePayload(line: DraftLine) {
  return {
    productId: line.productId,
    quantity: parseQuantity(line.quantity),
    unitPriceCents: parseEuros(line.unitPrice),
    ...(line.promo && { promo: promoPayload(line.promo) }),
  };
}

export function draftLineAmounts(line: DraftLine): LineAmounts | null {
  const quantity = parseQuantity(line.quantity);
  const unitPriceCents = parseEuros(line.unitPrice);
  if (quantity === null || unitPriceCents === null) return null;
  return { quantity, unitPriceCents, promo: line.promo ? readDraftPromo(line.promo, unitPriceCents) : null };
}
