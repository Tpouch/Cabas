import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("sends the password and where to go next", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {} });
    render(<LoginForm action={action} next="/products" />);
    const password = screen.getByLabelText("Mot de passe");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await userEvent.type(password, "secret");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(sent)).toEqual({ password: "secret", next: "/products" });
  });

  it("shows why the login failed", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { password: ["Mot de passe incorrect."] } });
    render(<LoginForm action={action} next="/" />);
    await userEvent.type(screen.getByLabelText("Mot de passe"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText("Mot de passe incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toHaveFocus();
  });

  it("shows a lockout or configuration message", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {}, message: "Trop d'essais. Réessaie dans 15 min." });
    render(<LoginForm action={action} next="/" />);
    await userEvent.type(screen.getByLabelText("Mot de passe"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trop d'essais. Réessaie dans 15 min.");
  });
});
