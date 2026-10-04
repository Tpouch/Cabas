import { describe, expect, it } from "vitest";
import { firstParam } from "./search-params";

describe("firstParam", () => {
  it("keeps a single value and the first of repeated values", () => {
    expect(firstParam("lait")).toBe("lait");
    expect(firstParam(["lait", "café"])).toBe("lait");
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam([])).toBeUndefined();
  });
});
