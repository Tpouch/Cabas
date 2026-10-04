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
