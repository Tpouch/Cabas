import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { lastTwelveMonths } from "@/lib/months";
import { MonthlyChart } from "./monthly-chart";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const months = lastTwelveMonths("2026-10").map((month) => ({ month, totalCents: month === "2026-09" ? 30000 : 0 }));
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("MonthlyChart", () => {
  it("lists the 12 months and their totals for screen readers, empty months included", () => {
    render(<MonthlyChart months={months} selected="2026-10" />);
    const table = screen.getByRole("table", { name: "Dépenses des 12 derniers mois" });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => plain(row.textContent));
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("Novembre 20250,00 €");
    expect(rows[10]).toBe("Septembre 2026300,00 €");
  });

});
