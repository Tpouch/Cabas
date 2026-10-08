/** Quantities have at most 3 decimals: work on thousandths so 1.005 × 1000 is exactly 1005. */
function thousandths(quantity: number): number {
  return Math.round(quantity * 1000);
}

/** quantity × cents, rounded half up to the cent. */
export function multiplyByQuantity(quantity: number, cents: number): number {
  return Math.round((thousandths(quantity) * cents) / 1000);
}

/** Whole items in a quantity: 3 for 3, 1 for a loose 1.5. */
export function wholeUnits(quantity: number): number {
  return Math.floor(thousandths(quantity) / 1000);
}
