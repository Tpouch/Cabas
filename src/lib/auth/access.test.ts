import { describe, expect, it } from "vitest";
import { safeNextPath } from "./access";

describe("safeNextPath", () => {
  it.each([
    ["/products", "/products"],
    ["/products/0199?x=1", "/products/0199?x=1"],
    ["/", "/"],
  ])("keeps the app path %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([null, undefined, "", "products", "//evil.example", "/\\evil.example", "https://evil.example", "/login", "/login?next=/x"])(
    "sends %j back to the home page",
    (next) => {
      expect(safeNextPath(next)).toBe("/");
    },
  );
});
