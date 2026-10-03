import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { thumbPath } from "@/lib/uploads";
import { deleteImage, ImageRejectedError, resolveUploadPath, saveImage } from "./images";

async function jpegFile(width: number, height: number, name = "photo.jpg"): Promise<File> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(buffer)], name, { type: "image/jpeg" });
}

const uploads = () => process.env.UPLOADS_DIR as string;

describe("saveImage", () => {
  it("re-encodes a photo to WebP, resizes it and writes a thumbnail", async () => {
    const path = await saveImage(await jpegFile(3000, 2000), "products");
    expect(path).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    const main = await sharp(await readFile(join(uploads(), path))).metadata();
    const thumb = await sharp(await readFile(join(uploads(), thumbPath(path)))).metadata();
    expect(main).toMatchObject({ format: "webp", width: 800 });
    expect(thumb).toMatchObject({ format: "webp", width: 300 });
  });

  it("keeps receipts up to 1600 px on the long edge", async () => {
    const path = await saveImage(await jpegFile(1000, 4000), "receipts");
    const main = await sharp(await readFile(join(uploads(), path))).metadata();
    expect(main.height).toBe(1600);
  });

  it("rejects a file that is not an image", async () => {
    const fake = new File([new TextEncoder().encode("%PDF-1.7 not an image")], "photo.jpg", { type: "image/jpeg" });
    await expect(saveImage(fake, "products")).rejects.toThrow(ImageRejectedError);
  });

  it("rejects a small file that decodes to more than 100 megapixels", async () => {
    const bomb = await sharp({ create: { width: 10_500, height: 10_000, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(bomb.byteLength).toBeLessThan(10 * 1024 * 1024);
    const file = new File([new Uint8Array(bomb)], "bomb.png", { type: "image/png" });
    await expect(saveImage(file, "products")).rejects.toThrow("trop grande");
  });

  it("rejects a file over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(saveImage(big, "products")).rejects.toThrow("10 Mo");
  });
});

describe("deleteImage", () => {
  it("removes the image and its thumbnail, and ignores missing files", async () => {
    const path = await saveImage(await jpegFile(400, 400), "stores");
    await deleteImage(path);
    await expect(stat(join(uploads(), path))).rejects.toThrow();
    await expect(stat(join(uploads(), thumbPath(path)))).rejects.toThrow();
    await expect(deleteImage(path)).resolves.toBeUndefined();
    await expect(deleteImage(null)).resolves.toBeUndefined();
  });
});

describe("resolveUploadPath", () => {
  it("resolves a file inside a known folder", () => {
    expect(resolveUploadPath(["products", "a.webp"])).toBe(join(uploads(), "products", "a.webp"));
  });

  it.each([
    [["..", ".env"]],
    [["products", "..", "..", ".env"]],
    [["products", "%2e%2e", ".env"]],
    [["secrets", "a.webp"]],
    [["products"]],
    [["products", "%E0%A4%A"]],
  ])("refuses %j", (segments) => {
    expect(resolveUploadPath(segments)).toBeNull();
  });
});
