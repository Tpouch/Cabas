import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptField } from "./receipt-field";

describe("ReceiptField", () => {
  it("puts a dropped photo into the file input", () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:ticket"), revokeObjectURL: vi.fn() });
    render(<ReceiptField name="receipt" />);
    // jsdom cannot build a real FileList (no DataTransfer): record what the component assigns.
    const input = screen.getByLabelText(/Photo du ticket/) as HTMLInputElement;
    let assigned: unknown = null;
    Object.defineProperty(input, "files", { configurable: true, get: () => assigned, set: (value) => (assigned = value) });
    const dropped = Object.assign([new File(["x"], "ticket.jpg", { type: "image/jpeg" })], { item: () => null });

    fireEvent.drop(screen.getByText(/Glisse la photo du ticket/), { dataTransfer: { files: dropped } });

    expect(assigned).toBe(dropped);
    expect(screen.getByRole("img", { name: "Aperçu du ticket" })).toHaveAttribute("src", "blob:ticket");
  });

  it("shows the error under the field", () => {
    render(<ReceiptField name="receipt" errors={["L'image dépasse 10 Mo."]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("L'image dépasse 10 Mo.");
    expect(screen.getByLabelText(/Photo du ticket/)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("ReceiptField file choice", () => {
  it("refuses a photo over 10 MB before sending it and leaves the field empty", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:big"), revokeObjectURL: vi.fn() });
    render(<ReceiptField name="receipt" />);
    const input = screen.getByLabelText(/Photo du ticket/) as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }));
    expect(screen.getByRole("alert")).toHaveTextContent("L'image dépasse 10 Mo.");
    expect(input.files?.length ?? 0).toBe(0);
  });

  it("lets the user remove the chosen photo", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:ok"), revokeObjectURL: vi.fn() });
    render(<ReceiptField name="receipt" />);
    const input = screen.getByLabelText(/Photo du ticket/) as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "ticket.jpg", { type: "image/jpeg" }));
    await userEvent.click(screen.getByRole("button", { name: "Retirer la photo" }));
    expect(input.files?.length ?? 0).toBe(0);
    expect(screen.queryByRole("img", { name: "Aperçu du ticket" })).not.toBeInTheDocument();
  });
});
