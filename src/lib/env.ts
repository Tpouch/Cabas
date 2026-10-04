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

const authEnvSchema = z.object({
  APP_PASSWORD_HASH: z
    .string()
    .regex(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/, "APP_PASSWORD_HASH must be generated with `pnpm hash-password`"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  return authEnvSchema.parse(source);
}

export function getAuthEnv(): AuthEnv {
  return parseAuthEnv(process.env);
}
