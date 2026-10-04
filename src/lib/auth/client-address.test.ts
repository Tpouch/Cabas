import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

describe("clientAddress", () => {
  it("uses the address added last by the proxy, not the ones the client sent", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then to a shared key", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
    expect(clientAddress(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
