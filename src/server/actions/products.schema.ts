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
    .min(1, "Indique la contenance.")
    .refine((value) => !/[.,]/.test(value), "La contenance doit être un nombre entier (ex. 1500 pour 1,5 kg).")
    .refine((value) => /^\d*$/.test(value) || /[.,]/.test(value), "Indique la contenance en chiffres.")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .positive("La contenance doit être supérieure à 0.")
        .max(999_999, "La contenance doit être inférieure à 1 000 000."),
    ),
  sizeUnit: z.enum(["G", "ML", "PIECE"], { error: "Choisis une unité." }),
});
