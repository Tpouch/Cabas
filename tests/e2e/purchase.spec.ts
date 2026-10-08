import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("record a purchase while creating a store and a product, then delete it", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  const store = `Leclerc ${suffix}`;
  const product = `Lentilles ${suffix}`;
  const receipt = await sharp({ create: { width: 900, height: 2400, channels: 3, background: "#fff" } }).jpeg().toBuffer();

  await page.goto("/purchases/new");

  await page.getByRole("combobox", { name: "Magasin" }).click();
  await page.getByPlaceholder("Rechercher…").fill(store);
  await page.getByRole("option", { name: `Créer « ${store} »` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);

  await page.getByRole("combobox", { name: "Ajouter un article" }).click();
  await page.getByPlaceholder("Rechercher…").fill(product);
  await page.getByRole("option", { name: `Créer « ${product} »` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contenance").fill("500");
  await dialog.getByLabel(`Prix chez ${store}`).fill("1,49");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByLabel(`Prix unitaire de ${product}`)).toHaveValue("1,49");

  await page.getByRole("button", { name: "Augmenter" }).click();
  await page.getByRole("button", { name: "Augmenter" }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("4,47");

  // "2 achetés = 1 offert" on 3 items: one is free, the store price stays 1,49.
  await page.getByRole("button", { name: `Ajouter une promo sur ${product}` }).click();
  await page.getByRole("button", { name: "Achetés / offerts" }).click();
  await page.getByLabel(`Articles achetés pour ${product}`).fill("2");
  await page.getByLabel(`Articles offerts pour ${product}`).fill("1");
  await page.getByRole("button", { name: `Valider la promo sur ${product}` }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("2,98");

  // The draft survives a reload (phone call, accidental refresh), promotion included.
  await page.reload();
  await expect(page.getByLabel(`Quantité de ${product}`)).toHaveValue("3");
  await expect(page.getByRole("button", { name: /2 achetés = 1 offert/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);

  await page.getByLabel(/Photo du ticket/).setInputFiles({ name: "ticket.jpg", mimeType: "image/jpeg", buffer: receipt });
  await page.getByRole("button", { name: "Enregistrer la course" }).click();

  await expect(page.getByRole("heading", { level: 1, name: store })).toBeVisible();
  await expect(page.getByText(/2 achetés = 1 offert/)).toBeVisible();
  await expect(page.getByText("Promos (1 article)")).toBeVisible();
  await expect(page.getByText(/2,98\s€/).last()).toBeVisible();
  await expect(page.getByRole("img", { name: /Ticket de caisse/ })).toBeVisible();
  const detailUrl = page.url();

  await page.goto("/purchases");
  await expect(page.getByRole("link", { name: new RegExp(store) }).first()).toBeVisible();

  await page.goto(`/products?q=${encodeURIComponent(product)}`);
  await page.getByRole("link", { name: new RegExp(product) }).click();
  await expect(page.getByRole("row").filter({ hasText: store })).toContainText("1,49");
  const productUrl = page.url();

  await page.goto(detailUrl);
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page).toHaveURL(/\/purchases$/);

  await page.goto(productUrl);
  await expect(page.getByText("Aucun prix relevé pour ce produit.")).toBeVisible();
});
