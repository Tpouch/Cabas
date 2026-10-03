import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/products/0199-abc" }));

describe("AppNav", () => {
  it("links every section in the mobile bar and the desktop sidebar", () => {
    render(<AppNav />);
    for (const nav of [
      screen.getByRole("navigation", { name: "Navigation principale" }),
      screen.getByRole("navigation", { name: "Menu" }),
    ]) {
      expect(within(nav).getByRole("link", { name: /Accueil/ })).toHaveAttribute("href", "/");
      expect(within(nav).getByRole("link", { name: /Produits/ })).toHaveAttribute("href", "/products");
      expect(within(nav).getByRole("link", { name: /Magasins/ })).toHaveAttribute("href", "/stores");
    }
  });

  it("marks the section of the current page as active", () => {
    render(<AppNav />);
    const sidebar = screen.getByRole("navigation", { name: "Menu" });
    expect(within(sidebar).getByRole("link", { name: /Produits/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: /Accueil/ })).not.toHaveAttribute("aria-current");
  });
});
