import { describe, expect, it } from "vitest";
import { todayIso } from "./dates";

describe("todayIso", () => {
  it("uses the Paris calendar day", () => {
    expect(todayIso(new Date("2026-10-03T21:30:00Z"))).toBe("2026-10-03");
    expect(todayIso(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04");
  });
});
