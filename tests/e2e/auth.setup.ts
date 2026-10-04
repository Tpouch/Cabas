import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE, E2E_PASSWORD } from "./credentials";

setup("log in once for the other tests", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: AUTH_STATE });
});
