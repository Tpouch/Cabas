import { z } from "zod";
import { parseEuros } from "@/domain/money";
import { todayIso } from "@/lib/dates";

const LINES_ERROR = "Vérifie la quantité et le prix de chaque article.";

const lineSchema = z.object({
  productId: z.uuid({ error: LINES_ERROR }),
  quantity: z
    .number({ error: LINES_ERROR })
    .positive(LINES_ERROR)
    .max(9999, LINES_ERROR)
    .refine((quantity) => Number.isInteger(Math.round(quantity * 1000 * 1e6) / 1e6), LINES_ERROR),
  unitPriceCents: z.number({ error: LINES_ERROR }).int(LINES_ERROR).positive(LINES_ERROR).max(9_999_999, LINES_ERROR),
});

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
    .pipe(z.array(lineSchema, { error: LINES_ERROR }).min(1, "Ajoute au moins un article.")),
});
