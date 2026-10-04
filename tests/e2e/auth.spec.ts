import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./credentials";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("asks for the password, then returns to the requested page", async ({ page }) => {
    await page.goto("/products?q=lait");
    await expect(page).toHaveURL(/\/login\?next=%2Fproducts%3Fq%3Dlait$/);
    await page.getByLabel("Mot de passe").fill("wrong password");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Mot de passe incorrect.")).toBeVisible();
    await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/products\?q=lait$/);
  });

  test("does not serve photos or accept posts without a session", async ({ request }) => {
    expect((await request.get("/uploads/products/x.webp")).status()).toBe(401);
    expect((await request.post("/products", { data: "x" })).status()).toBe(401);
  });

  test("ignores a next parameter pointing outside the app", async ({ page }) => {
    await page.goto("/login?next=//example.com");
    await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
  });
});

test("logs out", async ({ browser }) => {
  // A separate login, so logging out does not touch the session shared by the other tests.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.locator("button:visible", { hasText: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/products");
  await expect(page).toHaveURL(/\/login\?next=%2Fproducts$/);
  await context.close();
});
