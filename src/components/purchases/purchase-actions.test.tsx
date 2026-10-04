import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseActions } from "./purchase-actions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const deletePurchaseAction = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/purchases", () => ({ deletePurchaseAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PurchaseActions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("links to the edit page", () => {
    render(<PurchaseActions purchaseId="p1" />);
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/purchases/p1/edit");
  });

  it("deletes after confirmation and goes back to the history", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePurchaseAction.mockResolvedValue({ ok: true, data: null });
    render(<PurchaseActions purchaseId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deletePurchaseAction).toHaveBeenCalledWith("p1");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/purchases"));
  });

  it("does nothing when the deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    deletePurchaseAction.mockClear();
    render(<PurchaseActions purchaseId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deletePurchaseAction).not.toHaveBeenCalled();
  });
});
