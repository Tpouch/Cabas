import { z } from "zod";

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Indique le nom du produit.").max(120, "120 caractères maximum."),
  brand: z
    .string()
    .trim()
    .max(80, "80 caractères maximum.")
    .transform((value) => value || null),
  sizeValue: z
    .string()
    .trim()
    .refine((value) => !/[.,]/.test(value), "La contenance doit être un nombre entier (ex. 1500 pour 1,5 kg).")
    .transform(Number)
    .pipe(
      z.number({ error: "Indique la contenance en chiffres." }).int().positive("La contenance doit être supérieure à 0."),
    ),
  sizeUnit: z.enum(["G", "ML", "PIECE"], { error: "Choisis une unité." }),
});
