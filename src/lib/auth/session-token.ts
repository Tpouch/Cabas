import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "cabas_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(expiresAtMs: number, key: string): string {
  const payload = `v1.${expiresAtMs}`;
  return `${payload}.${sign(payload, key)}`;
}

export function isValidSessionToken(token: string | undefined, key: string, nowMs: number): boolean {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return false;
  const [version, expiry, signature] = parts as [string, string, string];
  if (version !== "v1" || !/^\d+$/.test(expiry)) return false;
  const expected = Buffer.from(sign(`${version}.${expiry}`, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Number(expiry) > nowMs;
}

/** Ties sessions to the password: changing it invalidates every existing cookie. */
export function sessionSigningKey(secret: string, passwordHash: string): string {
  return `${secret}:${passwordHash}`;
}
