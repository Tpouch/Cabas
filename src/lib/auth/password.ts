import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// No "server-only" import: scripts/hash-password.ts runs this file directly with Node.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash, ...rest] = stored.split(":");
  if (scheme !== "scrypt" || rest.length > 0 || !salt || !hash) return false;
  const params = [n, r, p].map(Number);
  if (params.some((value) => !Number.isInteger(value) || value <= 0)) return false;
  const [cost, blockSize, parallelization] = params as [number, number, number];
  const expected = Buffer.from(hash, "base64url");
  if (expected.length === 0) return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });
  return timingSafeEqual(actual, expected);
}
