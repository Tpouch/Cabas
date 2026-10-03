const EUROS_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;

export function parseEuros(input: string): number | null {
  const compact = input.replace(/€/g, "").replace(/[\s  ]/g, "");
  const match = EUROS_PATTERN.exec(compact);
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = euros * 100 + cents;
  return total > 0 ? total : null;
}

const euroFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuros(cents: number): string {
  return euroFormatter.format(cents / 100);
}
