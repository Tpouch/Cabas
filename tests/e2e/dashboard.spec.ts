import { expect, test } from "@playwright/test";
import { previousMonth } from "@/lib/months";

const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

test("the dashboard shows a month's spending and savings", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  // A past month per project: the mobile and desktop runs share one database.
  const month = suffix === "mobile" ? "2025-03" : "2025-04";
  const monthLabel = suffix === "mobile" ? "Mars 2025" : "Avril 2025";
  const store = `Intermarché ${suffix}`;
  const product = `Farine ${suffix}`;

  await page.goto("/purchases/new");
  await page.getByRole("combobox", { name: "Magasin" }).click();
  await page.getByPlaceholder("Rechercher…").fill(store);
  await page.getByRole("option", { name: `Créer « ${store} »` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await page.getByLabel("Date").fill(`${month}-15`);

  await page.getByRole("combobox", { name: "Ajouter un article" }).click();
  await page.getByPlaceholder("Rechercher…").fill(product);
  await page.getByRole("option", { name: `Créer « ${product} »` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contenance").fill("1000");
  await dialog.getByLabel(`Prix chez ${store}`).fill("2,00");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("button", { name: "Augmenter" }).click();

  await page.getByRole("button", { name: `Ajouter une promo sur ${product}` }).click();
  await page.getByRole("button", { name: "− %" }).click();
  await page.getByLabel(`Pourcentage de remise pour ${product}`).fill("30");
  await page.getByRole("button", { name: `Valider la promo sur ${product}` }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("2,80");
  await page.getByRole("button", { name: "Enregistrer la course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: store })).toBeVisible();
  const detailUrl = page.url();

  await page.goto(`/?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: monthLabel })).toBeVisible();
  expect(plain(await page.getByRole("group", { name: "Dépensé" }).textContent())).toContain("2,80 €");
  expect(plain(await page.getByRole("group", { name: "Courses" }).textContent())).toContain("Panier moyen 2,80 €");
  expect(plain(await page.getByRole("group", { name: "Économisé" }).textContent())).toContain("Promotions1,20 €");
  await expect(page.getByRole("list", { name: "Produits les plus achetés" })).toContainText(product);
  await expect(page.getByRole("region", { name: "Dépenses par magasin" })).toContainText(store);

  if (suffix === "desktop") {
    // Recharts bars have no role: the class is the only handle on them. Bar 11 of 12 is the previous month.
    await page.locator(".recharts-bar-rectangle").nth(10).click();
    await expect(page).toHaveURL(new RegExp(`month=${previousMonth(month)}`));
  } else {
    await page.getByRole("link", { name: "Mois précédent" }).click();
  }
  await expect(page.getByText("Aucune course ce mois-ci")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enregistrer une course" })).toHaveAttribute("href", "/purchases/new");

  await page.goto(detailUrl);
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
});

test("an invalid month falls back to the current month", async ({ page }) => {
  await page.goto("/?month=2026-13");
  await expect(page.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
});
