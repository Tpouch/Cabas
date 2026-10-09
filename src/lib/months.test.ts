import { describe, expect, it } from "vitest";
import { currentMonth, lastTwelveMonths, monthRange, nextMonth, parseMonth, previousMonth } from "./months";

const now = new Date("2026-10-15T12:00:00.000Z");

describe("currentMonth", () => {
  it("is the month of today in Paris", () => {
    expect(currentMonth(now)).toBe("2026-10");
  });

  it("already moves to the new month at 00:30 in Paris on the 1st", () => {
    expect(currentMonth(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11");
  });
});

describe("parseMonth", () => {
  it("keeps a valid past month", () => {
    expect(parseMonth("2026-09", now)).toBe("2026-09");
  });

  it("keeps the current month", () => {
    expect(parseMonth("2026-10", now)).toBe("2026-10");
  });

  it("falls back to the current month when the month is missing", () => {
    expect(parseMonth(undefined, now)).toBe("2026-10");
  });

  it.each(["2026-13", "2026-00", "2026-9", "26-09", "abc", "", "0099-05", "2026-09-01"])(
    "falls back to the current month for %j",
    (value) => {
      expect(parseMonth(value, now)).toBe("2026-10");
    },
  );

  it("falls back to the current month for a future month", () => {
    expect(parseMonth("2026-11", now)).toBe("2026-10");
    expect(parseMonth("2099-01", now)).toBe("2026-10");
  });
});

describe("previousMonth and nextMonth", () => {
  it("cross year boundaries", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(nextMonth("2026-12")).toBe("2027-01");
  });

  it("move by one month inside a year", () => {
    expect(previousMonth("2026-10")).toBe("2026-09");
    expect(nextMonth("2026-09")).toBe("2026-10");
  });
});

describe("lastTwelveMonths", () => {
  it("lists the 12 months ending with the given month, oldest first", () => {
    expect(lastTwelveMonths("2026-03")).toEqual([
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});

describe("monthRange", () => {
  it("spans from the first day of the month to the first day of the next one", () => {
    const { start, end } = monthRange("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
