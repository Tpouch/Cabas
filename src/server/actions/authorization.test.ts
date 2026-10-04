import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "@/server/auth/session";
import { db } from "@/server/db";
import { cookieJar } from "../../../tests/setup/cookie-jar";
import * as alternatives from "./alternatives";
import * as prices from "./prices";
import * as products from "./products";
import * as purchases from "./purchases";
import * as stores from "./stores";

const modules = { alternatives, prices, products, purchases, stores };
const someId = "01999999-0000-7000-8000-000000000000";

// Iterates the real exports, so an action added later without a session check fails here.
const actions = Object.entries(modules).flatMap(([moduleName, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => typeof value === "function")
    .map(([name, fn]) => [`${moduleName}.${name}`, fn as (...args: unknown[]) => Promise<unknown>] as const),
);

describe("Server Actions without a session", () => {
  it("covers every action module", () => {
    expect(actions.length).toBeGreaterThanOrEqual(12);
  });

  it.each(actions)("%s is refused", async (_name, action) => {
    cookieJar.clear();
    const form = new FormData();
    form.set("name", "Intrus");
    await expect(action(someId, null, form)).rejects.toThrow(UnauthorizedError);
    await expect(action(null, form)).rejects.toThrow(UnauthorizedError);
    expect(await db().store.count()).toBe(0);
  });
});
