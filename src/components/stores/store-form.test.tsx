import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoreForm } from "./store-form";

describe("StoreForm", () => {
  it("shows the error returned for a field and keeps the typed values", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { name: ["Ce magasin existe déjà."] } });
    render(<StoreForm action={action} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Lidl Lomme");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Ce magasin existe déjà.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Lidl Lomme");
    expect(screen.getByLabelText("Nom")).toHaveAttribute("aria-invalid", "true");
  });

  it("hands the saved store back on success", async () => {
    const store = { id: "s1", name: "Lidl", address: null, logoPath: null };
    const action = vi.fn().mockResolvedValue({ ok: true, data: store });
    const onDone = vi.fn();
    render(<StoreForm action={action} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Lidl");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(store));
  });
});
