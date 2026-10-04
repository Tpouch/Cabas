import { describe, expect, it } from "vitest";
import { decideAccess, isPublicPath, safeNextPath } from "./access";

describe("safeNextPath", () => {
  it.each([
    ["/products", "/products"],
    ["/products/0199?x=1", "/products/0199?x=1"],
    ["/", "/"],
  ])("keeps the app path %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "products",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/login",
    "/login?next=/x",
    // Browsers drop tabs and newlines in URLs: these become //evil.example.
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "\t//evil.example",
    "/ /evil.example",
  ])(
    "sends %j back to the home page",
    (next) => {
      expect(safeNextPath(next)).toBe("/");
    },
  );
});

describe("safeNextPath with encoded tricks", () => {
  it.each([
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
    ["/%5Cevil.example", "/%5Cevil.example"],
    ["/\uFF0F/evil.example", "/%EF%BC%8F/evil.example"],
  ])("keeps %j on this site as %j", (next, expected) => {
    const result = safeNextPath(next);
    expect(result).toBe(expected);
    // Whatever comes back must resolve on our own origin.
    expect(new URL(result, "http://cabas.test").origin).toBe("http://cabas.test");
  });
});

describe("decideAccess", () => {
  const request = (pathname: string, authenticated: boolean, method = "GET", search = "") =>
    decideAccess({ pathname, search, method, authenticated });

  it.each(["/login", "/icon.svg", "/apple-icon.png", "/favicon.ico", "/_next/static/chunks/a.js", "/_next/image"])(
    "lets anyone reach %s",
    (pathname) => {
      expect(isPublicPath(pathname)).toBe(true);
      expect(request(pathname, false)).toEqual({ kind: "allow" });
    },
  );

  it("sends a visitor to the login page and back to where they were going", () => {
    expect(request("/products", false, "GET", "?q=lait")).toEqual({
      kind: "redirect",
      location: "/login?next=%2Fproducts%3Fq%3Dlait",
    });
  });

  it("answers 401 to images and form posts without a session", () => {
    expect(request("/uploads/products/a.webp", false)).toEqual({ kind: "unauthorized" });
    expect(request("/products", false, "POST")).toEqual({ kind: "unauthorized" });
  });

  it("lets a signed-in user through, and skips the login page", () => {
    expect(request("/products", true)).toEqual({ kind: "allow" });
    expect(request("/uploads/products/a.webp", true)).toEqual({ kind: "allow" });
    expect(request("/login", true)).toEqual({ kind: "redirect", location: "/" });
    expect(request("/login", true, "POST")).toEqual({ kind: "allow" });
  });

  it.each(["/loginx", "/icon.svg.png", "/_next/data/x.json"])("does not treat %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});
