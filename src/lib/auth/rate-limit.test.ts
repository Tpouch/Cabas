import { describe, expect, it } from "vitest";
import { LoginLimiter } from "./rate-limit";

const minute = 60_000;

describe("LoginLimiter", () => {
  it("allows 5 failures, then blocks that address until the 15-minute window ends", () => {
    const limiter = new LoginLimiter();
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.retryAfterMs("203.0.113.7", start + i)).toBe(0);
      limiter.recordFailure("203.0.113.7", start + i);
    }
    expect(limiter.retryAfterMs("203.0.113.7", start + 5 * minute)).toBe(10 * minute);
    expect(limiter.retryAfterMs("203.0.113.7", start + 15 * minute)).toBe(0);
  });

  it("does not block other addresses", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure("203.0.113.7", 0);
    expect(limiter.retryAfterMs("198.51.100.2", 1)).toBe(0);
  });

  it("starts a new window once the previous one is over", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 4; i += 1) limiter.recordFailure("a", 0);
    limiter.recordFailure("a", 16 * minute);
    expect(limiter.retryAfterMs("a", 16 * minute)).toBe(0);
  });

  it("forgets an address's failures after it logs in", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure("a", 0);
    limiter.reset("a");
    expect(limiter.retryAfterMs("a", 1)).toBe(0);
  });

  it("keeps memory bounded when many addresses fail", () => {
    const limiter = new LoginLimiter(5, 15 * minute, 100);
    for (let i = 0; i < 1000; i += 1) limiter.recordFailure(`10.0.${Math.floor(i / 256)}.${i % 256}`, i);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});
