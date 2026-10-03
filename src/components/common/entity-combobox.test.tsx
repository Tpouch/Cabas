import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type ComboboxOption, EntityCombobox } from "./entity-combobox";

const stores: ComboboxOption[] = [
  { id: "lidl", label: "Lidl Lomme" },
  { id: "leclerc", label: "Leclerc Templeuve" },
];

function Harness({ onCreate }: { onCreate?: (query: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <form aria-label="test">
      <EntityCombobox
        id="store"
        name="storeId"
        label="Magasin"
        options={stores}
        value={value}
        onChange={setValue}
        onCreate={onCreate}
        placeholder="Choisir un magasin"
      />
    </form>
  );
}

describe("EntityCombobox", () => {
  it("selects an option found by typing and stores its id in the form", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "lecl");
    await userEvent.click(screen.getByRole("option", { name: "Leclerc Templeuve" }));
    expect(screen.getByRole("combobox", { name: "Magasin" })).toHaveTextContent("Leclerc Templeuve");
    const form = screen.getByRole("form", { name: "test" }) as HTMLFormElement;
    expect(new FormData(form).get("storeId")).toBe("leclerc");
  });

  it("offers to create what was typed when nothing matches exactly", async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "Auchan V2");
    await userEvent.click(screen.getByRole("option", { name: "Créer « Auchan V2 »" }));
    expect(onCreate).toHaveBeenCalledWith("Auchan V2");
  });
});
