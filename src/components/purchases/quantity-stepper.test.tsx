import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { QuantityStepper } from "./quantity-stepper";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper id="q" label="Quantité de Pommes" value={value} onChange={setValue} />;
}

describe("QuantityStepper", () => {
  it("adds and removes one unit, keeping decimals", async () => {
    render(<Harness initial="1,2" />);
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("2,2");
    await userEvent.click(screen.getByRole("button", { name: "Diminuer" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("1,2");
  });

  it("never goes below a positive quantity", async () => {
    render(<Harness initial="1" />);
    await userEvent.click(screen.getByRole("button", { name: "Diminuer" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("1");
  });

  it("accepts a typed weight and flags an invalid value", async () => {
    render(<Harness initial="1" />);
    const input = screen.getByLabelText("Quantité de Pommes");
    await userEvent.clear(input);
    await userEvent.type(input, "0,75");
    expect(input).toHaveValue("0,75");
    expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("starts from 1 when the field holds no valid number", async () => {
    render(<Harness initial="" />);
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("2");
  });
});
