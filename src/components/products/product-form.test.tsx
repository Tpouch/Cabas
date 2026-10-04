import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductForm } from "./product-form";

describe("ProductForm", () => {
  it("sends the size in base units with the chosen unit", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {} });
    render(<ProductForm action={action} defaultName="Riz basmati" onDone={vi.fn()} />);
    expect(screen.getByLabelText("Nom")).toHaveValue("Riz basmati");
    await userEvent.type(screen.getByLabelText("Contenance"), "1000");
    await userEvent.selectOptions(screen.getByLabelText("Unité"), "g");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(sent.get("sizeValue")).toBe("1000");
    expect(sent.get("sizeUnit")).toBe("G");
  });

  it("shows the size error next to the field", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { sizeValue: ["La contenance doit être supérieure à 0."] } });
    render(<ProductForm action={action} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Penne");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("La contenance doit être supérieure à 0.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contenance")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nom")).toHaveValue("Penne");
  });
});

describe("ProductForm accessibility", () => {
  it("lets the user pick an existing photo instead of forcing the camera", () => {
    render(<ProductForm action={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByLabelText(/Photo/)).not.toHaveAttribute("capture");
  });

  it("only links error messages that are shown", () => {
    render(<ProductForm action={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByLabelText("Nom")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Contenance")).toHaveAttribute("aria-describedby", "sizeValue-help");
  });

  it("moves focus to the first invalid field after an error", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      errors: { sizeValue: ["Indique la contenance."] },
    });
    render(<ProductForm action={action} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Penne");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Indique la contenance.");
    expect(screen.getByLabelText("Contenance")).toHaveFocus();
    expect(screen.getByLabelText("Contenance")).toHaveAttribute("aria-describedby", "sizeValue-error");
  });
});
