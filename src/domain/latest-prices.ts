export type PriceObservationInput = {
  storeId: string;
  priceCents: number;
  observedAt: Date;
  createdAt: Date;
};

export type StorePrice = { storeId: string; priceCents: number; observedAt: Date };

function isMoreRecent(a: PriceObservationInput, b: PriceObservationInput): boolean {
  const byDay = a.observedAt.getTime() - b.observedAt.getTime();
  return byDay !== 0 ? byDay > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

function byPriceThenRecency(a: StorePrice, b: StorePrice): number {
  return a.priceCents - b.priceCents || b.observedAt.getTime() - a.observedAt.getTime();
}

export function latestPricesByStore(observations: PriceObservationInput[]): StorePrice[] {
  const latest = new Map<string, PriceObservationInput>();
  for (const observation of observations) {
    const current = latest.get(observation.storeId);
    if (!current || isMoreRecent(observation, current)) latest.set(observation.storeId, observation);
  }
  return [...latest.values()]
    .map(({ storeId, priceCents, observedAt }) => ({ storeId, priceCents, observedAt }))
    .sort(byPriceThenRecency);
}

export function cheapestStorePrice(prices: StorePrice[]): StorePrice | null {
  return [...prices].sort(byPriceThenRecency)[0] ?? null;
}
