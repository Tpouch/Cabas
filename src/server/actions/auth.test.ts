import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { hasSession, requireSession, UnauthorizedError } from "@/server/auth/session";
import { cookieJar, requestHeaders } from "../../../tests/setup/cookie-jar";
import { loginAction, logoutAction } from "./auth";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("loginAction", () => {
  it("logs in with the right password, sets a 30-day HttpOnly cookie and returns to the page", async () => {
    cookieJar.clear();
    await expect(loginAction(null, form({ password: "test-password", next: "/products" }))).rejects.toThrow(
      "NEXT_REDIRECT:/products",
    );
    expect(cookieJar.get(SESSION_COOKIE)?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 2_592_000,
    });
    expect(await hasSession()).toBe(true);
  });

  it("refuses a wrong password and sets no cookie", async () => {
    cookieJar.clear();
    expect(await loginAction(null, form({ password: "nope", next: "/" }))).toEqual({
      ok: false,
      errors: { password: ["Mot de passe incorrect."] },
    });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("never sends the user outside the app", async () => {
    cookieJar.clear();
    await expect(loginAction(null, form({ password: "test-password", next: "//evil.example" }))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
  });

  it("blocks the 6th attempt within 15 minutes, even with the right password", async () => {
    cookieJar.clear();
    for (let i = 0; i < 5; i += 1) await loginAction(null, form({ password: "wrong" }));
    const result = await loginAction(null, form({ password: "test-password" }));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/^Trop d'essais\. Réessaie dans 15 min\.$/) });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("keeps blocking per address: another device can still log in", async () => {
    cookieJar.clear();
    for (let i = 0; i < 5; i += 1) await loginAction(null, form({ password: "wrong" }));
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    await expect(loginAction(null, form({ password: "test-password", next: "/" }))).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("stops all new logins after 50 failures from many addresses within 15 minutes", async () => {
    cookieJar.clear();
    for (let i = 0; i < 50; i += 1) {
      requestHeaders.set("x-forwarded-for", `10.0.0.${i}`);
      await loginAction(null, form({ password: "wrong" }));
    }
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    const result = await loginAction(null, form({ password: "test-password" }));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/^Trop d'essais/) });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("explains a missing server configuration instead of crashing", async () => {
    const secret = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(await loginAction(null, form({ password: "test-password" }))).toMatchObject({
        ok: false,
        message: "La connexion n'est pas configurée sur le serveur.",
      });
      expect(await hasSession()).toBe(false);
    } finally {
      process.env.SESSION_SECRET = secret;
    }
  });
});

describe("session checks", () => {
  it("rejects a session signed before the password changed", async () => {
    const hash = process.env.APP_PASSWORD_HASH;
    expect(await hasSession()).toBe(true);
    process.env.APP_PASSWORD_HASH = hashPassword("new-password");
    try {
      expect(await hasSession()).toBe(false);
    } finally {
      process.env.APP_PASSWORD_HASH = hash;
    }
  });

  it("requires a session", async () => {
    await expect(requireSession()).resolves.toBeUndefined();
    cookieJar.clear();
    await expect(requireSession()).rejects.toThrow(UnauthorizedError);
  });

  it("logs out by deleting the cookie", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("requirePageSession", () => {
  it("sends a visitor without a session to the login page", async () => {
    const { requirePageSession } = await import("@/server/auth/session");
    await expect(requirePageSession()).resolves.toBeUndefined();
    cookieJar.clear();
    await expect(requirePageSession()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
