import "server-only";
import { LoginLimiter } from "@/lib/auth/rate-limit";

const GLOBAL_KEY = "all";
const globalForLimiter = globalThis as unknown as { cabasLoginLimiters?: { perClient: LoginLimiter; global: LoginLimiter } };

/** One pair of limiters per process, kept across dev hot reloads. */
const limiters = (globalForLimiter.cabasLoginLimiters ??= {
  // 5 failures per address per 15 minutes.
  perClient: new LoginLimiter(5, 15 * 60_000),
  // Ceiling across every address: a distributed attack (or one that cycles addresses to evict
  // its own entry) still gets at most 50 tries per 15 minutes. Signed-in devices are unaffected.
  global: new LoginLimiter(50, 15 * 60_000, 1),
});

export const loginLimiter = {
  retryAfterMs(client: string, nowMs: number): number {
    return Math.max(limiters.perClient.retryAfterMs(client, nowMs), limiters.global.retryAfterMs(GLOBAL_KEY, nowMs));
  },
  recordFailure(client: string, nowMs: number): void {
    limiters.perClient.recordFailure(client, nowMs);
    limiters.global.recordFailure(GLOBAL_KEY, nowMs);
  },
  /** A successful login clears that address only; the global count expires with its window. */
  reset(client?: string): void {
    if (client === undefined) {
      limiters.perClient.reset();
      limiters.global.reset();
    } else {
      limiters.perClient.reset(client);
    }
  },
};
