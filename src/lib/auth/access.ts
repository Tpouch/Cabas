const BASE = "http://cabas.invalid";

/**
 * Only same-site paths. Whitespace, control characters and backslashes are refused outright
 * (browsers drop tabs and newlines, turning "/\t/evil" into "//evil"), then the URL parser
 * must resolve the path on our own origin.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\s\\\u0000-\u001f\u007f]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE || url.pathname === "/login") return "/";
  return url.pathname + url.search + url.hash;
}
