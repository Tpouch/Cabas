import { describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken } from "./session-token";

const key = "k".repeat(40);
const now = Date.UTC(2026, 9, 4, 12);

describe("session token", () => {
  it("is valid until it expires", () => {
    const token = createSessionToken(now + 1000, key);
    expect(isValidSessionToken(token, key, now)).toBe(true);
    expect(isValidSessionToken(token, key, now + 1000)).toBe(false);
  });

  it("is rejected when signed with another key (other secret or changed password)", () => {
    const token = createSessionToken(now + 1000, key);
    expect(isValidSessionToken(token, "other".repeat(10), now)).toBe(false);
  });

  it("is rejected when its expiry is edited", () => {
    const token = createSessionToken(now + 1000, key);
    const [version, , signature] = token.split(".");
    expect(isValidSessionToken(`${version}.${now + 999_999_999}.${signature}`, key, now)).toBe(false);
  });

  it.each([undefined, "", "garbage", "v1.123", "v2.9999999999999.sig", "v1.abc.sig", "v1.1.2.3"])(
    "rejects %j",
    (token) => {
      expect(isValidSessionToken(token, key, now)).toBe(false);
    },
  );
});
