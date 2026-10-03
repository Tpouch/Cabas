import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export function getEnv(): Env {
  return parseEnv(process.env);
}
