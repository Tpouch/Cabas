import { z } from "zod";
import { parseEuros } from "@/domain/money";
import { PROMO_LIMITS } from "@/domain/promo";
import { todayIso } from "@/lib/dates";

const LINES_ERROR = "Vérifie la quantité et le prix de chaque article.";

const PERCENT_ERROR = "Indique un pourcentage entre 1 et 100.";
const NTH_ERROR = "Indique un rang entre 2 et 10.";
const ITEMS_ERROR = "Indique un nombre d’articles entre 1 et 20.";
const AMOUNT_ERROR = "Indique la remise par article, par exemple 0,50.";
const AMOUNT_TOO_HIGH = "La remise dépasse le prix de l’article.";

function wholeNumber(range: { min: number; max: number }, message: string) {
  return z.number({ error: message }).int(message).min(range.min, message).max(range.max, message);
}

const promoSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject(
      {
        kind: z.literal("AMOUNT_OFF_PER_UNIT"),
        amountCents: z.number({ error: AMOUNT_ERROR }).int(AMOUNT_ERROR).positive(AMOUNT_ERROR),
      },
      { error: LINES_ERROR },
    ),
    z.strictObject(
      { kind: z.literal("PERCENT_OFF"), percent: wholeNumber(PROMO_LIMITS.percent, PERCENT_ERROR) },
      { error: LINES_ERROR },
    ),
    z.strictObject(
      {
        kind: z.literal("NTH_PERCENT_OFF"),
        nth: wholeNumber(PROMO_LIMITS.nth, NTH_ERROR),
        percent: wholeNumber(PROMO_LIMITS.percent, PERCENT_ERROR),
      },
      { error: LINES_ERROR },
    ),
    z.strictObject(
      {
        kind: z.literal("BUY_GET_FREE"),
        buy: wholeNumber(PROMO_LIMITS.items, ITEMS_ERROR),
        free: wholeNumber(PROMO_LIMITS.items, ITEMS_ERROR),
      },
      { error: LINES_ERROR },
    ),
  ],
  { error: LINES_ERROR },
);

const lineSchema = z
  .object({
    productId: z.uuid({ error: LINES_ERROR }),
    quantity: z
      .number({ error: LINES_ERROR })
      .positive(LINES_ERROR)
      .max(9999, LINES_ERROR)
      .refine((quantity) => Number.isInteger(Math.round(quantity * 1000 * 1e6) / 1e6), LINES_ERROR),
    unitPriceCents: z.number({ error: LINES_ERROR }).int(LINES_ERROR).positive(LINES_ERROR).max(9_999_999, LINES_ERROR),
    promo: promoSchema.optional(),
  })
  .refine(
    (line) => line.promo?.kind !== "AMOUNT_OFF_PER_UNIT" || line.promo.amountCents <= line.unitPriceCents,
    AMOUNT_TOO_HIGH,
  );

export const purchaseInputSchema = z.object({
  storeId: z.uuid({ error: "Choisis un magasin." }),
  purchasedAt: z.iso
    .date({ error: "Indique une date valide." })
    .refine((value) => value <= todayIso(), "La date ne peut pas être dans le futur.")
    .transform((value) => new Date(`${value}T00:00:00Z`)),
  total: z
    .string()
    .transform((value) => parseEuros(value))
    .pipe(
      z
        .number({ error: "Indique le total payé, par exemple 23,47." })
        .max(9_999_999, "Le total doit être inférieur à 100 000 €."),
    ),
  lines: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: LINES_ERROR });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(lineSchema, { error: LINES_ERROR })
        .min(1, "Ajoute au moins un article.")
        .max(500, "Une course ne peut pas dépasser 500 articles."),
    ),
});
