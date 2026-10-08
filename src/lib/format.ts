import { formatEuros } from "@/domain/money";
import type { Promo } from "@/domain/promo";
import type { SizeUnit } from "@/domain/types";
import { measureLabel, pricePerMeasure } from "@/domain/unit-price";

const DAY_MS = 86_400_000;
const NBSP = "\u00a0";
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formatPerMeasure(priceCents: number, sizeValue: number, sizeUnit: SizeUnit): string {
  const perMeasure = Math.round(pricePerMeasure(priceCents, sizeValue, sizeUnit));
  return `${formatEuros(perMeasure)}/${measureLabel(sizeUnit)}`;
}

export function formatSize(sizeValue: number, sizeUnit: SizeUnit): string {
  if (sizeUnit === "PIECE") return `${sizeValue} ${sizeValue > 1 ? "pièces" : "pièce"}`;
  const [small, large] = sizeUnit === "G" ? ["g", "kg"] : ["ml", "L"];
  return sizeValue >= 1000 ? `${decimal.format(sizeValue / 1000)} ${large}` : `${sizeValue} ${small}`;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatPriceAge(observedAt: Date, now: Date): string {
  const days = Math.max(0, Math.round((utcDay(now) - utcDay(observedAt)) / DAY_MS));
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  const years = Math.floor(days / 365);
  return `il y a ${years} ${years > 1 ? "ans" : "an"}`;
}

const longDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Purchase dates are calendar days stored at UTC midnight: format them in UTC. */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}

export function formatMonthLabel(month: string): string {
  const label = monthYear.format(new Date(`${month}-01T00:00:00.000Z`));
  return label.charAt(0).toLocaleUpperCase("fr-FR") + label.slice(1);
}

const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatDayLabel(date: Date): string {
  const label = dayLabel.format(date);
  return label.charAt(0).toLocaleUpperCase("fr-FR") + label.slice(1);
}

export function formatDiscount(cents: number): string {
  return `−${formatEuros(cents)}`;
}

export function formatPromo(promo: Promo): string {
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return `${formatDiscount(promo.amountCents)} par article`;
    case "PERCENT_OFF":
      return `−${promo.percent}${NBSP}%`;
    case "NTH_PERCENT_OFF":
      return `Le ${promo.nth}e à −${promo.percent}${NBSP}%`;
    case "BUY_GET_FREE":
      return `${promo.buy} ${promo.buy > 1 ? "achetés" : "acheté"} = ${promo.free} ${promo.free > 1 ? "offerts" : "offert"}`;
  }
}
