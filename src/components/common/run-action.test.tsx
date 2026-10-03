import { describe, expect, it, vi } from "vitest";
import { runAction } from "./run-action";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

describe("runAction", () => {
  it("shows the success message and returns true", async () => {
    expect(await runAction(Promise.resolve({ ok: true, data: null }), "Supprimé")).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Supprimé");
  });

  it("shows the action's French message on an expected failure", async () => {
    expect(await runAction(Promise.resolve({ ok: false, errors: {}, message: "Ce produit n'existe plus." }), "x")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Ce produit n'existe plus.");
  });

  it("shows a generic message when the server cannot be reached", async () => {
    expect(await runAction(Promise.reject(new Error("network")), "x")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("L’action n’a pas pu aboutir. Réessaie dans un instant.");
  });
});
