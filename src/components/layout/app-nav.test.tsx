import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

let pathname = "/products/0199-abc";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));

describe("AppNav", () => {
  beforeEach(() => {
    pathname = "/products/0199-abc";
  });

  it("links every section in the mobile bar and the desktop sidebar", () => {
    render(<AppNav />);
    for (const nav of [
      screen.getByRole("navigation", { name: "Navigation principale" }),
      screen.getByRole("navigation", { name: "Menu" }),
    ]) {
      expect(within(nav).getByRole("link", { name: /Accueil/ })).toHaveAttribute("href", "/");
      expect(within(nav).getByRole("link", { name: /Courses/ })).toHaveAttribute("href", "/purchases");
      expect(within(nav).getByRole("link", { name: /Produits/ })).toHaveAttribute("href", "/products");
      expect(within(nav).getByRole("link", { name: /Magasins/ })).toHaveAttribute("href", "/stores");
    }
  });

  it("offers to log out from the sidebar", () => {
    render(<AppNav />);
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
  });

  it("shows the cabas logo as a link home in the sidebar", () => {
    render(<AppNav />);
    const home = screen.getByRole("link", { name: "cabas, accueil" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("svg")).not.toBeNull();
  });

  it("offers a new purchase from the mobile bar and the sidebar", () => {
    render(<AppNav />);
    const links = screen.getAllByRole("link", { name: "Nouvelle course" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/purchases/new");
  });

  it("marks the section of the current page as active", () => {
    render(<AppNav />);
    const sidebar = screen.getByRole("navigation", { name: "Menu" });
    expect(within(sidebar).getByRole("link", { name: /Produits/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: /Accueil/ })).not.toHaveAttribute("aria-current");
  });

  it.each(["/purchases/new", "/purchases/0199-abc/edit"])("hides the mobile bar on the purchase form %s", (path) => {
    pathname = path;
    render(<AppNav />);
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu" })).toBeInTheDocument();
  });
});
