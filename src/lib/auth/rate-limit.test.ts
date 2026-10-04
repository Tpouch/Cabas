import { describe, expect, it } from "vitest";
import { LoginLimiter } from "./rate-limit";

const minute = 60_000;

describe("LoginLimiter", () => {
  it("allows 5 failures, then blocks until the 15-minute window ends", () => {
    const limiter = new LoginLimiter();
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.retryAfterMs(start + i)).toBe(0);
      limiter.recordFailure(start + i);
    }
    expect(limiter.retryAfterMs(start + 5 * minute)).toBe(10 * minute);
    expect(limiter.retryAfterMs(start + 15 * minute)).toBe(0);
  });

  it("starts a new window once the previous one is over", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 4; i += 1) limiter.recordFailure(0);
    limiter.recordFailure(16 * minute);
    expect(limiter.retryAfterMs(16 * minute)).toBe(0);
  });

  it("forgets failures after a successful login", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure(0);
    limiter.reset();
    expect(limiter.retryAfterMs(1)).toBe(0);
  });
});
