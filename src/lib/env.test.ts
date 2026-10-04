import { describe, expect, it } from "vitest";
import { parseAuthEnv, parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a PostgreSQL URL and defaults the uploads directory", () => {
    expect(parseEnv({ DATABASE_URL: "postgresql://u:p@db:5432/cabas" })).toEqual({
      DATABASE_URL: "postgresql://u:p@db:5432/cabas",
      UPLOADS_DIR: "./uploads",
    });
  });

  it("rejects a missing or non-PostgreSQL database URL", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@db/cabas" })).toThrow();
  });
});

describe("parseAuthEnv", () => {
  const valid = {
    APP_PASSWORD_HASH: "scrypt:16384:8:1:c2FsdA:aGFzaA",
    SESSION_SECRET: "s".repeat(32),
  };

  it("reads the password hash, the session secret and the cookie flag", () => {
    expect(parseAuthEnv(valid)).toEqual({ ...valid, COOKIE_SECURE: false });
    expect(parseAuthEnv({ ...valid, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
  });

  it.each([
    [{ APP_PASSWORD_HASH: undefined }],
    [{ APP_PASSWORD_HASH: "my-password" }],
    [{ SESSION_SECRET: "too-short" }],
    [{ COOKIE_SECURE: "yes" }],
  ])("refuses %j", (override) => {
    expect(() => parseAuthEnv({ ...valid, ...override })).toThrow();
  });
});
