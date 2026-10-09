import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TopProducts } from "./top-products";

const penne = { productId: "penne", productName: "Penne", spendCents: 140, quantity: 2 };
const rice = { productId: "riz", productName: "Riz", spendCents: 250, quantity: 1.5 };
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");
const rows = () =>
  within(screen.getByRole("list", { name: "Produits les plus achetés" }))
    .getAllByRole("link")
    .map((link) => plain(link.textContent));

describe("TopProducts", () => {
  it("ranks products by spend by default, linking to each product", () => {
    render(<TopProducts bySpend={[rice, penne]} byQuantity={[penne, rice]} />);
    expect(screen.getByRole("button", { name: "Dépense" })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toEqual(["Riz2,50 €", "Penne1,40 €"]);
    expect(screen.getByRole("link", { name: /Riz/ })).toHaveAttribute("href", "/products/riz");
  });

  it("switches to the ranking by quantity", async () => {
    render(<TopProducts bySpend={[rice, penne]} byQuantity={[penne, rice]} />);
    await userEvent.click(screen.getByRole("button", { name: "Quantité" }));
    expect(screen.getByRole("button", { name: "Quantité" })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toEqual(["Penne× 2", "Riz× 1,5"]);
  });
});
