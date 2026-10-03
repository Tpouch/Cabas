import { describe, expect, it } from "vitest";
import { normalizeStoreName } from "./store-name";

describe("normalizeStoreName", () => {
  it("ignores case and extra spaces", () => {
    expect(normalizeStoreName("  Lidl   Lomme ")).toBe("lidl lomme");
    expect(normalizeStoreName("LIDL LOMME")).toBe(normalizeStoreName("lidl lomme"));
  });
});
