import type { SizeUnit } from "./types";
import { areComparable, pricePerMeasure } from "./unit-price";

export type ProductPricing = {
  id: string;
  sizeValue: number;
  sizeUnit: SizeUnit;
  bestPriceCents: number | null;
};

export type RankedAlternative = ProductPricing & {
  perMeasureCents: number | null;
  discountPercent: number | null;
};

function perMeasure(product: ProductPricing): number | null {
  return product.bestPriceCents === null
    ? null
    : pricePerMeasure(product.bestPriceCents, product.sizeValue, product.sizeUnit);
}

function group(alt: RankedAlternative, current: ProductPricing): number {
  if (alt.perMeasureCents === null) return 2;
  return areComparable(alt, current) ? 0 : 1;
}

export function rankAlternatives(current: ProductPricing, alternatives: ProductPricing[]): RankedAlternative[] {
  const currentPerMeasure = perMeasure(current);
  return alternatives
    .map((alt) => {
      const altPerMeasure = perMeasure(alt);
      const canCompare = altPerMeasure !== null && currentPerMeasure !== null && areComparable(alt, current);
      const discount = canCompare ? Math.round((1 - altPerMeasure / currentPerMeasure) * 100) : 0;
      return { ...alt, perMeasureCents: altPerMeasure, discountPercent: discount >= 1 ? discount : null };
    })
    .sort(
      (a, b) =>
        group(a, current) - group(b, current) ||
        (a.perMeasureCents ?? 0) - (b.perMeasureCents ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
