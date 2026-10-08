import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinesSummary } from "./lines-summary";

const twoPlusOne = { kind: "BUY_GET_FREE", buy: 2, free: 1 } as const;

function renderRows(lines: Parameters<typeof LinesSummary>[0]["lines"]) {
  render(
    <dl>
      <LinesSummary lines={lines} />
    </dl>,
  );
}

describe("LinesSummary", () => {
  it("shows only the sum when no line has a discount", () => {
    renderRows([{ quantity: 2, unitPriceCents: 120, promo: twoPlusOne }]); // not reached
    expect(screen.queryByText("Avant promos")).not.toBeInTheDocument();
    expect(screen.getByText("Somme des articles").nextElementSibling).toHaveTextContent(/2,40\s€/);
  });

  it("shows the amount before promotions and what they saved", () => {
    renderRows([
      { quantity: 3, unitPriceCents: 120, promo: twoPlusOne },
      { quantity: 1, unitPriceCents: 200, promo: { kind: "PERCENT_OFF", percent: 50 } },
      { quantity: 1, unitPriceCents: 99 },
    ]);
    expect(screen.getByText("Avant promos").nextElementSibling).toHaveTextContent(/6,59\s€/);
    expect(screen.getByText("Promos (2 articles)").nextElementSibling).toHaveTextContent(/−2,20\s€/);
    expect(screen.getByText("Somme des articles").nextElementSibling).toHaveTextContent(/4,39\s€/);
  });
});
