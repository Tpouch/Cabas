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

const PUBLIC_FILES = new Set(["/login", "/icon.svg", "/apple-icon.png", "/favicon.ico"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_FILES.has(pathname) || pathname.startsWith("/_next/static/") || pathname === "/_next/image";
}

export type Access = { kind: "allow" } | { kind: "redirect"; location: string } | { kind: "unauthorized" };

export function decideAccess(input: { pathname: string; search: string; method: string; authenticated: boolean }): Access {
  const { pathname, search, method, authenticated } = input;
  const isRead = method === "GET" || method === "HEAD";
  if (isPublicPath(pathname)) {
    return pathname === "/login" && authenticated && isRead ? { kind: "redirect", location: "/" } : { kind: "allow" };
  }
  if (authenticated) return { kind: "allow" };
  if (pathname.startsWith("/uploads/") || !isRead) return { kind: "unauthorized" };
  return { kind: "redirect", location: `/login?next=${encodeURIComponent(pathname + search)}` };
}
