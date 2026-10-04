import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupByMonth } from "@/lib/purchase-months";
import { PurchaseHistory } from "./purchase-history";

const lidl = { id: "lidl", name: "Lidl Lomme", address: null, logoPath: null };
const purchases = [
  { id: "p2", purchasedAt: new Date("2026-10-03T00:00:00.000Z"), totalCents: 4862, receiptPath: "receipts/a.webp", itemCount: 14, store: lidl },
  { id: "p1", purchasedAt: new Date("2026-09-30T00:00:00.000Z"), totalCents: 2790, receiptPath: null, itemCount: 1, store: lidl },
];
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("PurchaseHistory", () => {
  it("shows each month with its total, newest first", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => plain(h.textContent));
    expect(headings).toEqual(["Octobre 2026 48,62 €", "Septembre 2026 27,90 €"]);
  });

  it("links each purchase card to its detail", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    const cards = screen.getByRole("list", { name: "Courses d’octobre 2026" });
    const link = within(cards).getByRole("link", { name: /Lidl Lomme/ });
    expect(link).toHaveAttribute("href", "/purchases/p2");
    expect(plain(link.textContent)).toContain("Sam. 3 oct. · 14 articles");
    expect(plain(link.textContent)).toContain("48,62 €");
  });

  it("names the month list in correct French", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    expect(screen.getByRole("list", { name: "Courses de septembre 2026" })).toBeInTheDocument();
  });

  it("says 1 article in the singular", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    expect(screen.getAllByText(/1 article\b/).length).toBeGreaterThan(0);
  });
});
