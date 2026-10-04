import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores a salted scrypt hash, never the password", () => {
    const stored = hashPassword("courses du samedi");
    expect(stored).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(stored).not.toContain("courses");
    expect(hashPassword("courses du samedi")).not.toBe(stored);
  });

  it("accepts the right password and rejects others", () => {
    const stored = hashPassword("courses du samedi");
    expect(verifyPassword("courses du samedi", stored)).toBe(true);
    expect(verifyPassword("courses du dimanche", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it.each(["", "plain", "scrypt:16384:8:1:abc", "bcrypt:1:2:3:abc:def", "scrypt:x:8:1:abc:def"])(
    "rejects a malformed stored hash %j",
    (stored) => {
      expect(verifyPassword("anything", stored)).toBe(false);
    },
  );
});
