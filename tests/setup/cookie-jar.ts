/** In-memory stand-in for Next's cookie store in integration tests. */
export type StoredCookie = { value: string; options: Record<string, unknown> };
export const cookieJar = new Map<string, StoredCookie>();

/** Request headers seen by `headers()` in integration tests (reset before each test). */
export const requestHeaders = new Headers();
