import { describe, expect, it } from "vitest";
import { formatLongDate, formatMonthLabel, formatPerMeasure, formatPriceAge, formatShortDate, formatSize } from "./format";

const plain = (s: string) => s.replace(/[  ]/g, " ");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("formatPerMeasure", () => {
  it("shows the rounded price per kilo", () => {
    expect(plain(formatPerMeasure(99, 500, "G"))).toBe("1,98 €/kg");
  });
  it("shows the price per piece", () => {
    expect(plain(formatPerMeasure(315, 12, "PIECE"))).toBe("0,26 €/pièce");
  });
});

describe("formatSize", () => {
  it.each([
    [500, "G", "500 g"],
    [1000, "G", "1 kg"],
    [1500, "G", "1,5 kg"],
    [750, "ML", "750 ml"],
    [1500, "ML", "1,5 L"],
    [1, "PIECE", "1 pièce"],
    [12, "PIECE", "12 pièces"],
  ] as const)("formats %i %s as %j", (value, unit, expected) => {
    expect(plain(formatSize(value, unit))).toBe(expected);
  });
});

describe("formatPriceAge", () => {
  const now = new Date("2026-10-03T15:30:00.000Z");
  it.each([
    ["2026-10-03", "aujourd'hui"],
    ["2026-10-02", "hier"],
    ["2026-09-30", "il y a 3 j"],
    ["2026-08-01", "il y a 2 mois"],
    ["2025-09-01", "il y a 1 an"],
    ["2023-01-01", "il y a 3 ans"],
  ])("describes a price observed on %s as %j", (iso, expected) => {
    expect(formatPriceAge(day(iso), now)).toBe(expected);
  });
});

describe("purchase dates", () => {
  it("formats a calendar date without shifting it", () => {
    const date = new Date("2026-10-03T00:00:00.000Z");
    expect(formatLongDate(date)).toBe("samedi 3 octobre 2026");
    expect(formatShortDate(date)).toBe("03/10");
  });

  it("keeps the last day of a month in that month", () => {
    expect(formatLongDate(new Date("2026-09-30T00:00:00.000Z"))).toBe("mercredi 30 septembre 2026");
  });

  it("names a month with a capital letter", () => {
    expect(formatMonthLabel("2026-10")).toBe("Octobre 2026");
    expect(formatMonthLabel("2027-01")).toBe("Janvier 2027");
  });
});
