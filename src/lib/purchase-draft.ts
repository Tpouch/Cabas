import { z } from "zod";
import { formatEurosInput } from "@/domain/money";
import { formatQuantity } from "@/domain/purchase";
import type { PurchaseDetail } from "@/server/repositories/purchases";

export const DRAFT_STORAGE_KEY = "cabas:purchase-draft:v1";

const draftLineSchema = z.object({
  key: z.string(),
  productId: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
});

const draftSchema = z.object({
  storeId: z.string().nullable(),
  purchasedAt: z.string(),
  lines: z.array(draftLineSchema),
  total: z.string(),
  totalEdited: z.boolean(),
});

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
    })),
    total: formatEurosInput(purchase.totalCents),
    totalEdited: true,
  };
}