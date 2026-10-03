import type { SizeUnit } from "./types";

const MEASURE_LABELS = { G: "kg", ML: "L", PIECE: "pièce" } as const satisfies Record<SizeUnit, string>;

export function pricePerMeasure(priceCents: number, sizeValue: number, sizeUnit: SizeUnit): number {
  if (sizeValue <= 0) throw new RangeError("sizeValue must be positive");
  return sizeUnit === "PIECE" ? priceCents / sizeValue : (priceCents * 1000) / sizeValue;
}

export function measureLabel(unit: SizeUnit): (typeof MEASURE_LABELS)[SizeUnit] {
  return MEASURE_LABELS[unit];
}

export function areComparable(a: { sizeUnit: SizeUnit }, b: { sizeUnit: SizeUnit }): boolean {
  return a.sizeUnit === b.sizeUnit;
}
