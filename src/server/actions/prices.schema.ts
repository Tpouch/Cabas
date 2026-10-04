import { z } from "zod";
import { parseEuros } from "@/domain/money";
import { todayIso } from "@/lib/dates";

export const priceInputSchema = z.object({
  storeId: z.uuid({ error: "Choisis un magasin." }),
  price: z
    .string()
    .transform((value) => parseEuros(value))
    .pipe(
      z
        .number({ error: "Indique un prix valide, par exemple 1,29." })
        .max(9_999_999, "Le prix doit être inférieur à 100 000 €."),
    ),
  observedAt: z.iso
    .date({ error: "Indique une date valide." })
    // ISO dates compare correctly as strings.
    .refine((value) => value <= todayIso(), "La date ne peut pas être dans le futur.")
    .transform((value) => new Date(`${value}T00:00:00Z`)),
});
