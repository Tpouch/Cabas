import { describe, expect, it } from "vitest";
import { thumbPath, uploadUrl } from "./uploads";

describe("upload paths", () => {
  it("derives the thumbnail path", () => {
    expect(thumbPath("products/a.webp")).toBe("products/a-thumb.webp");
  });
  it("builds public URLs", () => {
    expect(uploadUrl("products/a.webp")).toBe("/uploads/products/a.webp");
    expect(uploadUrl("products/a.webp", { thumb: true })).toBe("/uploads/products/a-thumb.webp");
  });
});
