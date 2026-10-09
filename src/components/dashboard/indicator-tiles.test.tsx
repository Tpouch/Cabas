import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { IndicatorTiles } from "./indicator-tiles";

const props: ComponentProps<typeof IndicatorTiles> = {
  totalCents: 39000,
  changePercent: 30,
  previousMonth: "2026-09",
  purchaseCount: 2,
  averageBasketCents: 19500,
  promotionSavingsCents: 60,
  priceSavingsCents: 125,
};
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");
const tile = (name: string) => plain(screen.getByRole("group", { name }).textContent);

describe("IndicatorTiles", () => {
  it("shows the total spent and its change vs the previous month", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Dépensé")).toContain("390,00 €");
    expect(tile("Dépensé")).toContain("+30 % vs septembre");
  });

  it("hides the change when the previous month has nothing to compare with", () => {
    render(<IndicatorTiles {...props} changePercent={null} />);
    expect(tile("Dépensé")).not.toContain("vs septembre");
  });

  it("shows the purchase count and the average basket", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Courses")).toContain("2");
    expect(tile("Courses")).toContain("Panier moyen 195,00 €");
  });

  it("shows the money saved, split into promotions and the highest price", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Économisé")).toContain("1,85 €");
    expect(tile("Économisé")).toContain("Promotions0,60 €");
    expect(tile("Économisé")).toContain("Prix le plus haut1,25 €");
  });
});
