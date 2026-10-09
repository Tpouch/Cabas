import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreSpendBars } from "./store-spend";

const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("StoreSpendBars", () => {
  it("lists each store with what was spent there, highest first", () => {
    render(
      <StoreSpendBars
        stores={[
          { storeId: "auchan", storeName: "Auchan", totalCents: 25000 },
          { storeId: "lidl", storeName: "Lidl", totalCents: 14000 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").map((item) => plain(item.textContent));
    expect(items).toEqual(["Auchan250,00 €", "Lidl140,00 €"]);
  });
});
