/**
 * Global login limiter (single user, single process). Kept in memory: a restart clears it,
 * which only gives an attacker 5 more tries per restart.
 */
export class LoginLimiter {
  private failures = 0;
  private windowStart = 0;

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  private windowOver(nowMs: number): boolean {
    return nowMs - this.windowStart >= this.windowMs;
  }

  retryAfterMs(nowMs: number): number {
    if (this.failures < this.maxFailures || this.windowOver(nowMs)) return 0;
    return this.windowStart + this.windowMs - nowMs;
  }

  recordFailure(nowMs: number): void {
    if (this.failures === 0 || this.windowOver(nowMs)) {
      this.failures = 0;
      this.windowStart = nowMs;
    }
    this.failures += 1;
  }

  reset(): void {
    this.failures = 0;
    this.windowStart = 0;
  }
}
