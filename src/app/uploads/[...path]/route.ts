import { readFile } from "node:fs/promises";
import { hasSession } from "@/server/auth/session";
import { resolveUploadPath } from "@/server/storage/images";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await hasSession())) return new Response("Unauthorized", { status: 401 });
  const absolute = resolveUploadPath((await params).path);
  if (!absolute) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(absolute);
    return new Response(body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
