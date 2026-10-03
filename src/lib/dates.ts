const parisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

export function todayIso(now: Date = new Date()): string {
  return parisDay.format(now);
}
