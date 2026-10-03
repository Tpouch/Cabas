import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a PostgreSQL URL and defaults the uploads directory", () => {
    expect(parseEnv({ DATABASE_URL: "postgresql://u:p@db:5432/cabas" })).toEqual({
      DATABASE_URL: "postgresql://u:p@db:5432/cabas",
      UPLOADS_DIR: "./uploads",
    });
  });

  it("rejects a missing or non-PostgreSQL database URL", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@db/cabas" })).toThrow();
  });
});
