import { expect, test } from "@playwright/test";

test("the app can be installed: its manifest and icons need no session", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const response = await anonymous.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "cabas", start_url: "/", display: "standalone", lang: "fr-FR" });
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await anonymous.get(icon.src, { maxRedirects: 0 });
    expect(image.status(), icon.src).toBe(200);
  }
  await anonymous.dispose();
});
