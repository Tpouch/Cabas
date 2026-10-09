import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthSelector } from "./month-selector";

describe("MonthSelector", () => {
  it("names the month and links to the previous and next months", () => {
    render(<MonthSelector month="2026-09" current="2026-10" />);
    expect(screen.getByRole("heading", { level: 1, name: "Septembre 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mois précédent" })).toHaveAttribute("href", "/?month=2026-08");
    expect(screen.getByRole("link", { name: "Mois suivant" })).toHaveAttribute("href", "/?month=2026-10");
  });

  it("cannot go past the current month", () => {
    render(<MonthSelector month="2026-10" current="2026-10" />);
    expect(screen.queryByRole("link", { name: "Mois suivant" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  });
});
