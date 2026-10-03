import { z } from "zod";
import { parseEuros } from "@/domain/money";

export const priceInputSchema = z.object({
  storeId: z.uuid({ error: "Choisis un magasin." }),
  price: z
    .string()
    .transform((value) => parseEuros(value))
    .pipe(z.number({ error: "Indique un prix valide, par exemple 1,29." })),
  observedAt: z.iso
    .date({ error: "Indique une date valide." })
    .transform((value) => new Date(`${value}T00:00:00Z`)),
});
