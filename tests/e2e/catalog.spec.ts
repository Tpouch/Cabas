import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("add prices to a new product and see the cheapest store", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  const product = `Penne Rigate ${suffix}`;

  await page.goto("/products");
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.getByLabel("Nom", { exact: true }).fill(product);
  await page.getByLabel("Marque").fill("Barilla");
  await page.getByLabel("Contenance").fill("500");
  await page.getByLabel("Unité").selectOption("G");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: product })).toBeVisible();

  for (const [store, price] of [
    [`Lidl ${suffix}`, "0,99"],
    [`Auchan ${suffix}`, "0,89"],
  ] as const) {
    await page.getByRole("button", { name: "+ Ajouter un prix" }).click();
    await page.getByRole("combobox", { name: "Magasin" }).click();
    await page.getByPlaceholder("Rechercher…").fill(store);
    await page.getByRole("option", { name: `Créer « ${store} »` }).click();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(store);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);
    await page.getByLabel("Prix", { exact: true }).fill(price);
    await expect(page.getByText(/= \d,\d{2}\s€\/kg/)).toBeVisible();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("Prix ajouté")).toBeVisible();
  }

  const cheapestRow = page.getByRole("row").filter({ hasText: "Moins cher" });
  await expect(cheapestRow).toContainText(`Auchan ${suffix}`);
  await expect(cheapestRow).toContainText("1,78");

  await page.goto(`/products?q=${encodeURIComponent(product)}`);
  await expect(page.getByText(/dès 0,89/)).toBeVisible();
});

test("create a product with a phone-sized photo", async ({ page }, testInfo) => {
  const photo = await sharp({
    create: { width: 3000, height: 2250, channels: 3, background: "#000", noise: { type: "gaussian", mean: 128, sigma: 60 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  expect(photo.byteLength).toBeGreaterThan(2 * 1024 * 1024);
  expect(photo.byteLength).toBeLessThan(10 * 1024 * 1024);

  const product = `Riz basmati ${testInfo.project.name}`;
  await page.goto("/products");
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.getByLabel("Photo").setInputFiles({ name: "riz.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.getByLabel("Nom", { exact: true }).fill(product);
  await page.getByLabel("Contenance").fill("1000");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: product })).toBeVisible();
  await expect(page.getByRole("img", { name: product })).toBeVisible();
});
