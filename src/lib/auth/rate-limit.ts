type Entry = { failures: number; windowStart: number };

/**
 * Login limiter per client address (single process). Kept in memory: a restart clears it,
 * which only gives an attacker 5 more tries per address per restart.
 */
export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  private expired(entry: Entry, nowMs: number): boolean {
    return nowMs - entry.windowStart >= this.windowMs;
  }

  retryAfterMs(key: string, nowMs: number): number {
    const entry = this.entries.get(key);
    if (!entry || entry.failures < this.maxFailures || this.expired(entry, nowMs)) return 0;
    return entry.windowStart + this.windowMs - nowMs;
  }

  recordFailure(key: string, nowMs: number): void {
    const entry = this.entries.get(key);
    if (entry && !this.expired(entry, nowMs)) {
      entry.failures += 1;
      return;
    }
    this.entries.delete(key);
    this.makeRoom(nowMs);
    this.entries.set(key, { failures: 1, windowStart: nowMs });
  }

  reset(key?: string): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }

  /** Drops expired entries, then the oldest ones, so many addresses cannot exhaust memory. */
  private makeRoom(nowMs: number): void {
    if (this.entries.size < this.maxEntries) return;
    for (const [key, entry] of this.entries) if (this.expired(entry, nowMs)) this.entries.delete(key);
    for (const key of this.entries.keys()) {
      if (this.entries.size < this.maxEntries) break;
      this.entries.delete(key);
    }
  }
}
