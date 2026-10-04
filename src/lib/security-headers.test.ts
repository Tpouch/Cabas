import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const header = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe("securityHeaders", () => {
  it("forbids framing, sniffing and leaking the referrer to other sites", () => {
    const headers = securityHeaders({ production: true });
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
    expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(headers, "Referrer-Policy")).toBe("same-origin");
    expect(header(headers, "Permissions-Policy")).toContain("geolocation=()");
  });

  it("only allows the app's own resources", () => {
    const csp = header(securityHeaders({ production: true }), "Content-Security-Policy") ?? "";
    for (const directive of [
      "default-src 'self'",
      "img-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows what the development server needs", () => {
    const csp = header(securityHeaders({ production: false }), "Content-Security-Policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });
});
