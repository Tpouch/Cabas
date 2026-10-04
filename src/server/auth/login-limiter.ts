import "server-only";
import { LoginLimiter } from "@/lib/auth/rate-limit";

const globalForLimiter = globalThis as unknown as { cabasLoginLimiter?: LoginLimiter };

/** One limiter per process, kept across dev hot reloads. */
export const loginLimiter = (globalForLimiter.cabasLoginLimiter ??= new LoginLimiter());
