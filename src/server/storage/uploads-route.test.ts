import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/uploads/[...path]/route";
import { cookieJar } from "../../../tests/setup/cookie-jar";

async function request(path: string[]) {
  return GET(new Request("http://cabas.test/uploads/" + path.join("/")), { params: Promise.resolve({ path }) });
}

describe("GET /uploads", () => {
  it("serves a stored image to a signed-in user", async () => {
    await mkdir(join(process.env.UPLOADS_DIR as string, "products"), { recursive: true });
    await writeFile(join(process.env.UPLOADS_DIR as string, "products", "a.webp"), "webp");
    const response = await request(["products", "a.webp"]);
    expect(response.status).toBe(200);
    // Private photos: browsers may cache them, shared caches must not.
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });

  it("refuses images without a session", async () => {
    cookieJar.clear();
    expect((await request(["products", "a.webp"])).status).toBe(401);
  });
});
