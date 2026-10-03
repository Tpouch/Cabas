import { z } from "zod";

export const storeInputSchema = z.object({
  name: z.string().trim().min(1, "Indique le nom du magasin.").max(80, "80 caractères maximum."),
  address: z
    .string()
    .trim()
    .max(200, "200 caractères maximum.")
    .transform((value) => value || null),
});
