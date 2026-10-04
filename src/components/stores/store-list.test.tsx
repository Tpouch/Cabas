import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoreList } from "./store-list";

vi.mock("@/server/actions/stores", () => ({
  createStoreAction: vi.fn(),
  updateStoreAction: vi.fn(),
  deleteStoreAction: vi.fn(),
}));

const stores = [{ id: "s1", name: "Lidl Lomme", address: null, logoPath: null }];

describe("StoreList", () => {
  it("keeps the edit title while the edit dialog closes", async () => {
    render(<StoreList stores={stores} />);
    await userEvent.click(screen.getByRole("button", { name: "Modifier Lidl Lomme" }));
    const title = await screen.findByRole("heading", { name: "Modifier le magasin" });
    await userEvent.keyboard("{Escape}");
    // During the exit animation the same title must stay; it never flips to "Nouveau magasin".
    expect(title).toHaveTextContent("Modifier le magasin");
    expect(screen.queryByRole("heading", { name: "Nouveau magasin" })).not.toBeInTheDocument();
  });

  it("opens an empty form for a new store after editing one", async () => {
    render(<StoreList stores={stores} />);
    await userEvent.click(screen.getByRole("button", { name: "Modifier Lidl Lomme" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Nouveau magasin" }));
    expect(await screen.findByRole("heading", { name: "Nouveau magasin" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("");
  });
});
