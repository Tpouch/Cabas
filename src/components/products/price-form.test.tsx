import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceForm } from "./price-form";

const product = {
  id: "p1",
  name: "Penne",
  brand: "Barilla",
  photoPath: null,
  sizeValue: 500,
  sizeUnit: "G" as const,
  bestPriceCents: 99,
};
const stores = [{ id: "lidl", name: "Lidl", address: null, logoPath: null }];
const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

describe("PriceForm", () => {
  it("shows the price per kilo while typing", async () => {
    render(<PriceForm product={product} stores={stores} action={vi.fn()} createStore={vi.fn()} onDone={vi.fn()} today="2026-10-03" />);
    await userEvent.type(screen.getByLabelText("Prix"), "1,19");
    expect(plain(screen.getByTestId("per-measure").textContent)).toBe("= 2,38 €/kg");
  });

  it("defaults the date to today and sends the chosen store", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: null });
    const onDone = vi.fn();
    render(<PriceForm product={product} stores={stores} action={action} createStore={vi.fn()} onDone={onDone} today="2026-10-03" />);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-03");
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.click(screen.getByRole("option", { name: "Lidl" }));
    await userEvent.type(screen.getByLabelText("Prix"), "0,99");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(sent)).toEqual({ storeId: "lidl", price: "0,99", observedAt: "2026-10-03" });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
