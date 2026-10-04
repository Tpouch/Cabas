/**
 * The client address as seen by the HTTPS reverse proxy (Nginx Proxy Manager). The proxy
 * appends the address it received the connection from to X-Forwarded-For, so the last entry is
 * the one a client cannot forge — as long as only the proxy can reach the app's port.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || headers.get("x-real-ip")?.trim() || "unknown";
}
