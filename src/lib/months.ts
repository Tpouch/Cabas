import { z } from "zod";
import { todayIso } from "./dates";

/** Years before 1900 are refused: Date.UTC maps years 0–99 to 1900–1999. */
const monthSchema = z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/);

export function currentMonth(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

/** A bookmarkable `?month=` value: anything invalid or in the future means the current month. */
export function parseMonth(value: string | undefined, now: Date = new Date()): string {
  const current = currentMonth(now);
  const parsed = monthSchema.safeParse(value);
  return parsed.success && parsed.data <= current ? parsed.data : current;
}

function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, index + delta, 1)).toISOString().slice(0, 7);
}

export function previousMonth(month: string): string {
  return shiftMonth(month, -1);
}

export function nextMonth(month: string): string {
  return shiftMonth(month, 1);
}

export function lastTwelveMonths(month: string): string[] {
  return Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
}

/** Purchase dates are calendar days stored at UTC midnight. */
export function monthRange(month: string): { start: Date; end: Date } {
  return { start: new Date(`${month}-01T00:00:00.000Z`), end: new Date(`${nextMonth(month)}-01T00:00:00.000Z`) };
}
