import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { getEnv } from "@/lib/env";
import { thumbPath } from "@/lib/uploads";

export type ImageKind = "stores" | "products" | "receipts";

const KINDS: readonly ImageKind[] = ["stores", "products", "receipts"];
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_EDGE: Record<ImageKind, number> = { stores: 800, products: 800, receipts: 1600 };
const THUMB_EDGE = 300;
/** Above any phone camera (48 MP) but blocks decompression bombs. */
const MAX_PIXELS = 100_000_000;

export class ImageRejectedError extends Error {}

function uploadsRoot(): string {
  return resolve(getEnv().UPLOADS_DIR);
}

export async function saveImage(file: File, kind: ImageKind): Promise<string> {
  if (file.size > MAX_BYTES) throw new ImageRejectedError("L'image dépasse 10 Mo.");
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input)
    .metadata()
    .catch(() => null);
  if (!metadata?.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new ImageRejectedError("Ce fichier n'est pas une image JPEG, PNG ou WebP.");
  }
  if ((metadata.width ?? 0) * (metadata.height ?? 0) > MAX_PIXELS) {
    throw new ImageRejectedError("L'image est trop grande (100 mégapixels maximum).");
  }

  const relativePath = `${kind}/${randomUUID()}.webp`;
  const resize = (edge: number) =>
    sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  const [main, thumb] = await Promise.all([resize(MAX_EDGE[kind]), resize(THUMB_EDGE)]);

  await mkdir(join(uploadsRoot(), kind), { recursive: true });
  await writeFile(join(uploadsRoot(), relativePath), main);
  await writeFile(join(uploadsRoot(), thumbPath(relativePath)), thumb);
  return relativePath;
}

export async function deleteImage(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const absolute = resolveUploadPath(relativePath.split("/"));
  if (!absolute) return;
  await rm(absolute, { force: true });
  await rm(thumbPath(absolute), { force: true });
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function resolveUploadPath(segments: string[]): string | null {
  const maybeDecoded = segments.map(safeDecode);
  if (maybeDecoded.includes(null)) return null;
  const decoded = maybeDecoded as string[];
  const [kind, ...rest] = decoded;
  if (!kind || !KINDS.includes(kind as ImageKind) || rest.length === 0) return null;
  if (decoded.some((segment) => segment === ".." || segment === "." || segment.includes("/") || segment.includes("\\"))) {
    return null;
  }
  const root = uploadsRoot();
  const absolute = resolve(root, ...decoded);
  return absolute.startsWith(root + sep) ? absolute : null;
}
