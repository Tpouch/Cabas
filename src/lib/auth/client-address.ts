/**
 * The client address as seen by the reverse proxy (Coolify's Traefik). The proxy appends the
 * address it received the connection from to X-Forwarded-For, so the last entry is the one a
 * client cannot forge. Only valid because the app is reachable through the proxy alone.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || headers.get("x-real-ip")?.trim() || "unknown";
}
