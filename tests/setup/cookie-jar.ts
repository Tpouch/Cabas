/** In-memory stand-in for Next's cookie store in integration tests. */
export type StoredCookie = { value: string; options: Record<string, unknown> };
export const cookieJar = new Map<string, StoredCookie>();
