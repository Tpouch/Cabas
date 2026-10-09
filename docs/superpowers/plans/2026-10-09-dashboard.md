# cabas — Dashboard and release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into the monthly dashboard (spending, change vs the previous month, purchase count and average basket, savings split into promotions and vs the highest price, a 12-month chart, top products and spend per store), make the app installable with a web app manifest, and ship a documented backup command.

**Architecture:** Pure statistics functions in `src/domain/statistics.ts` work on plain `StatPurchase` objects. A read-only repository (`src/server/repositories/statistics.ts`) loads the rows, and a server loader (`src/server/dashboard.ts`) combines both into one `Dashboard` view model, which keeps the page thin and lets the whole assembly be integration-tested. The UI is mostly Server Components. Only the Recharts bar chart and the top-products toggle are Client Components.

**Tech Stack:** Next.js 16 (App Router), React 19.2, TypeScript strict, Prisma 7 + PostgreSQL 18, Tailwind 4 + shadcn/ui, Recharts 3 (new), Zod 4, sharp, Vitest + Testing Library + Testcontainers, Playwright, pnpm.

**Spec:** [`docs/superpowers/specs/2026-10-09-dashboard-design.md`](../specs/2026-10-09-dashboard-design.md) (implements [`2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md) §2, §3, §5.6 and §6.3, and [`2026-10-08-promotions-design.md`](../specs/2026-10-08-promotions-design.md) §8). Before starting, read `CLAUDE.md` and `AGENTS.md`, plus the Next.js, Prisma, Recharts and Testing sections of `docs/best-practices.md`.

## Global Constraints

- pnpm only. The **one** new dependency is `recharts` (^3). TDD for every behavior: write a failing test first, watch it fail, write the minimal code, then refactor.
- Amounts are integer cents, rounded half up. Quantities have at most 3 decimals and are multiplied with `multiplyByQuantity` (never `quantity * cents` directly).
- Months are `YYYY-MM` strings. Purchase dates are `@db.Date` values at UTC midnight: use `monthKey` and UTC dates, and never convert them to local time. "Today" and "current month" are Europe/Paris (`todayIso`).
- Top products by spend use **net** line amounts (`lineNet`). Savings vs the highest price use the **regular** `unitPriceCents`.
- `src/domain/` knows nothing about React, Prisma, Next.js or `src/lib/`.
- UI copy is in French, with the typographic apostrophe `’` and the minus sign `−` (U+2212). Code, comments and docs are in English.
- Mobile first, touch targets ≥ 44 px (`h-11` / `size-11`), prices in `font-mono`, savings in `text-savings`. The change vs the previous month is neutral (ink), never green or red.
- Server Components by default. `"use client"` only for `monthly-chart` and `top-products`.
- Next.js 16: `searchParams` is a Promise and must be awaited. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` before Task 11.
- Conventional Commits in English, with **no mention of Claude or any AI and no `Co-Authored-By` line**.
- `pnpm lint && pnpm typecheck && pnpm test` pass before every commit.
- Work on branch `feat/dashboard` (it already exists and has the spec committed).

## Review Focus

1. **A hand-edited or stale month URL** (`?month=2026-13`, `?month=2099-01`, `?month=0099-05`, `?month=abc`, `?month=a&month=b`): the page shows the current month and never crashes or queries a nonsense range. Pinned in Task 1, and in Task 10 via `firstParam`.
2. **Month boundaries and Paris midnight**: a purchase dated the last day of a month counts in that month and not the next. At 00:30 in Paris on the 1st, the current month is already the new one (UTC is still on the previous day). Pinned in Tasks 1 and 5.
3. **A previous month with no purchases**: the change badge is hidden. It never shows "Infinity %" or "NaN %". Pinned in Tasks 2 and 7.
4. **A product priced in only one store, or another store's price recorded after the purchase date** (for example when an old purchase is entered late): that line saves 0, and savings are never negative. Pinned in Task 4.
5. **Months without purchases inside the 12-month window**: they still appear, as a 0 € bar and a 0 € row in the accessible table, so the chart always has 12 bars. Pinned in Tasks 2, 6 and 9.

---

## File Structure

```
src/lib/
  months.ts             (new)  # currentMonth, parseMonth, previousMonth, nextMonth, lastTwelveMonths, monthRange
  format.ts                    # + formatMonthName, formatShortMonth, formatChange
  auth/access.ts               # + manifest and install icons in PUBLIC_FILES
src/domain/
  statistics.ts         (new)  # StatPurchase types + pure statistics functions
src/server/
  repositories/purchases.ts    # export promoFromColumns (reused)
  repositories/statistics.ts (new)  # listPurchasesForStats, monthlyTotals, listObservationsForProducts
  dashboard.ts          (new)  # loadDashboard(month): Dashboard (repository + domain)
src/components/dashboard/
  month-selector.tsx    (new)  # ‹ month › links
  indicator-tiles.tsx   (new)  # Dépensé / Courses / Économisé
  top-products.tsx      (new)  # "use client": Dépense / Quantité toggle + top 5
  store-spend.tsx       (new)  # CSS horizontal bars
  monthly-chart.tsx     (new)  # "use client": Recharts BarChart + sr-only table
src/app/
  (app)/page.tsx               # the dashboard
  manifest.ts           (new)  # PWA manifest
public/icons/                  # icon-192.png, icon-512.png, icon-maskable-512.png (generated once)
scripts/backup.sh       (new)  # pg_dump -Fc + uploads archive
tests/e2e/
  dashboard.spec.ts     (new)
  pwa.spec.ts           (new)
README.md, CLAUDE.md, docs/superpowers/plans/2026-10-03-cabas-roadmap.md
```

---

### Task 1: Month helpers

**Files:**
- Create: `src/lib/months.ts`
- Test: `src/lib/months.test.ts`

**Interfaces:**
- Consumes: `todayIso(now?: Date): string` from `src/lib/dates.ts` (returns `YYYY-MM-DD` in Europe/Paris).
- Produces:
  - `currentMonth(now?: Date): string`
  - `parseMonth(value: string | undefined, now?: Date): string`
  - `previousMonth(month: string): string`, `nextMonth(month: string): string`
  - `lastTwelveMonths(month: string): string[]` (oldest first, ends with `month`)
  - `monthRange(month: string): { start: Date; end: Date }` (UTC midnight, `end` exclusive)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/months.test.ts
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
      "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
      "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/months.test.ts`
Expected: FAIL with "Failed to resolve import "./months"".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/months.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/months.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/lib/months.ts src/lib/months.test.ts
git commit -m "feat(dashboard): add month helpers for the selected month"
```

---

### Task 2: Monthly indicators in the domain

**Files:**
- Create: `src/domain/statistics.ts`
- Test: `src/domain/statistics.test.ts`

**Interfaces:**
- Consumes: `Promo` from `src/domain/promo.ts`; `sumOfDiscounts(lines: LineAmounts[]): number` from `src/domain/purchase.ts`.
- Produces (exported from `src/domain/statistics.ts`):

```ts
export type StatLine = { productId: string; productName: string; quantity: number; unitPriceCents: number; promo: Promo | null };
export type StatPurchase = { purchasedAt: Date; storeId: string; storeName: string; totalCents: number; lines: StatLine[] };
export type MonthTotal = { month: string; totalCents: number };
export function totalSpent(purchases: StatPurchase[]): number;
export function changeVsPrevious(currentCents: number, previousCents: number): number | null;
export function averageBasket(totalCents: number, count: number): number;
export function promotionSavings(purchases: StatPurchase[]): number;
export function fillMonths(months: string[], totals: MonthTotal[]): MonthTotal[];
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/statistics.test.ts
import { describe, expect, it } from "vitest";
import {
  averageBasket,
  changeVsPrevious,
  fillMonths,
  promotionSavings,
  type StatLine,
  type StatPurchase,
  totalSpent,
} from "./statistics";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function line(overrides: Partial<StatLine> = {}): StatLine {
  return { productId: "penne", productName: "Penne", quantity: 1, unitPriceCents: 100, promo: null, ...overrides };
}

function purchase(overrides: Partial<StatPurchase> = {}): StatPurchase {
  return { purchasedAt: day("2026-10-10"), storeId: "lidl", storeName: "Lidl", totalCents: 100, lines: [line()], ...overrides };
}

describe("totalSpent", () => {
  it("adds up the totals paid", () => {
    expect(totalSpent([purchase({ totalCents: 4862 }), purchase({ totalCents: 2790 })])).toBe(7652);
  });

  it("is 0 without purchases", () => {
    expect(totalSpent([])).toBe(0);
  });
});

describe("changeVsPrevious", () => {
  it("is the rise in percent", () => {
    expect(changeVsPrevious(5500, 5000)).toBe(10);
  });

  it("is the drop in percent, rounded to the nearest percent", () => {
    expect(changeVsPrevious(1000, 3000)).toBe(-67);
  });

  it("is null when the previous month has nothing to compare with", () => {
    expect(changeVsPrevious(5000, 0)).toBeNull();
  });
});

describe("averageBasket", () => {
  it("divides the total by the purchase count, rounded half up", () => {
    expect(averageBasket(10000, 3)).toBe(3333);
    expect(averageBasket(5, 2)).toBe(3);
  });

  it("is 0 without purchases", () => {
    expect(averageBasket(0, 0)).toBe(0);
  });
});

describe("promotionSavings", () => {
  it("adds up the promotion discounts of every line", () => {
    const purchases = [
      purchase({ lines: [line({ quantity: 2, promo: { kind: "PERCENT_OFF", percent: 30 } }), line()] }),
      purchase({ lines: [line({ quantity: 3, unitPriceCents: 149, promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } })] }),
    ];
    expect(promotionSavings(purchases)).toBe(60 + 149);
  });

  it("is 0 when no line has a promotion", () => {
    expect(promotionSavings([purchase()])).toBe(0);
  });
});

describe("fillMonths", () => {
  it("gives every month a total, 0 when it had no purchases", () => {
    expect(fillMonths(["2026-08", "2026-09", "2026-10"], [{ month: "2026-09", totalCents: 500 }])).toEqual([
      { month: "2026-08", totalCents: 0 },
      { month: "2026-09", totalCents: 500 },
      { month: "2026-10", totalCents: 0 },
    ]);
  });

  it("ignores totals outside the months", () => {
    expect(fillMonths(["2026-10"], [{ month: "2025-10", totalCents: 500 }])).toEqual([{ month: "2026-10", totalCents: 0 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: FAIL with "Failed to resolve import "./statistics"".

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/statistics.ts
import type { Promo } from "./promo";
import { sumOfDiscounts } from "./purchase";

export type StatLine = { productId: string; productName: string; quantity: number; unitPriceCents: number; promo: Promo | null };
export type StatPurchase = { purchasedAt: Date; storeId: string; storeName: string; totalCents: number; lines: StatLine[] };
export type MonthTotal = { month: string; totalCents: number };

export function totalSpent(purchases: StatPurchase[]): number {
  return purchases.reduce((sum, purchase) => sum + purchase.totalCents, 0);
}

/** Null when there is nothing to compare with, so the UI hides the change. */
export function changeVsPrevious(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return Math.round(((currentCents - previousCents) / previousCents) * 100);
}

export function averageBasket(totalCents: number, count: number): number {
  return count === 0 ? 0 : Math.round(totalCents / count);
}

export function promotionSavings(purchases: StatPurchase[]): number {
  return purchases.reduce((sum, purchase) => sum + sumOfDiscounts(purchase.lines), 0);
}

export function fillMonths(months: string[], totals: MonthTotal[]): MonthTotal[] {
  const byMonth = new Map(totals.map((total) => [total.month, total.totalCents]));
  return months.map((month) => ({ month, totalCents: byMonth.get(month) ?? 0 }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/domain/statistics.ts src/domain/statistics.test.ts
git commit -m "feat(dashboard): compute monthly spending indicators"
```

---

### Task 3: Top products and spend per store

**Files:**
- Modify: `src/domain/statistics.ts`
- Test: `src/domain/statistics.test.ts`

**Interfaces:**
- Consumes: `StatPurchase` (Task 2); `lineNet(line: LineAmounts): number` from `src/domain/purchase.ts`.
- Produces:

```ts
export type ProductRank = { productId: string; productName: string; spendCents: number; quantity: number };
export type StoreSpend = { storeId: string; storeName: string; totalCents: number };
export function topProducts(purchases: StatPurchase[], by: "spend" | "quantity", limit?: number): ProductRank[]; // limit defaults to 5
export function spendPerStore(purchases: StatPurchase[]): StoreSpend[];
```

- [ ] **Step 1: Write the failing tests**

Add `spendPerStore` and `topProducts` to the import from `./statistics` in `src/domain/statistics.test.ts`, then append:

```ts
describe("topProducts", () => {
  it("ranks products by net spend, after promotions", () => {
    const purchases = [
      purchase({
        lines: [
          line({ productId: "penne", productName: "Penne", quantity: 2, promo: { kind: "PERCENT_OFF", percent: 30 } }),
          line({ productId: "riz", productName: "Riz", unitPriceCents: 150 }),
        ],
      }),
    ];
    expect(topProducts(purchases, "spend").map((p) => [p.productName, p.spendCents])).toEqual([
      ["Riz", 150],
      ["Penne", 140],
    ]);
  });

  it("adds up a product bought in several purchases", () => {
    const purchases = [purchase(), purchase({ lines: [line({ quantity: 3 })] })];
    expect(topProducts(purchases, "spend")).toEqual([{ productId: "penne", productName: "Penne", spendCents: 400, quantity: 4 }]);
  });

  it("ranks products by quantity, keeping decimals exact", () => {
    const purchases = [
      purchase({
        lines: [
          line({ productId: "pommes", productName: "Pommes", quantity: 0.1 }),
          line({ productId: "pommes", productName: "Pommes", quantity: 0.2 }),
          line({ productId: "riz", productName: "Riz", quantity: 2 }),
        ],
      }),
    ];
    expect(topProducts(purchases, "quantity").map((p) => [p.productName, p.quantity])).toEqual([
      ["Riz", 2],
      ["Pommes", 0.3],
    ]);
  });

  it("breaks ties by product name in French order", () => {
    const purchases = [
      purchase({
        lines: [
          line({ productId: "f", productName: "Farine" }),
          line({ productId: "e", productName: "Éclairs" }),
        ],
      }),
    ];
    expect(topProducts(purchases, "spend").map((p) => p.productName)).toEqual(["Éclairs", "Farine"]);
  });

  it("keeps the 5 first products only", () => {
    const lines = ["a", "b", "c", "d", "e", "f"].map((id, i) => line({ productId: id, productName: id, unitPriceCents: 100 + i }));
    expect(topProducts([purchase({ lines })], "spend").map((p) => p.productId)).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("is empty without purchases", () => {
    expect(topProducts([], "spend")).toEqual([]);
  });
});

describe("spendPerStore", () => {
  it("adds up the totals paid per store, highest first", () => {
    const purchases = [
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 1000 }),
      purchase({ storeId: "auchan", storeName: "Auchan", totalCents: 1500 }),
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 800 }),
    ];
    expect(spendPerStore(purchases)).toEqual([
      { storeId: "lidl", storeName: "Lidl", totalCents: 1800 },
      { storeId: "auchan", storeName: "Auchan", totalCents: 1500 },
    ]);
  });

  it("breaks ties by store name", () => {
    const purchases = [
      purchase({ storeId: "lidl", storeName: "Lidl", totalCents: 1000 }),
      purchase({ storeId: "auchan", storeName: "Auchan", totalCents: 1000 }),
    ];
    expect(spendPerStore(purchases).map((s) => s.storeName)).toEqual(["Auchan", "Lidl"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: FAIL with "topProducts is not a function" (and the same for `spendPerStore`).

- [ ] **Step 3: Write the implementation**

In `src/domain/statistics.ts`, change the purchase import to `import { lineNet, sumOfDiscounts } from "./purchase";` and append:

```ts
export type ProductRank = { productId: string; productName: string; spendCents: number; quantity: number };
export type StoreSpend = { storeId: string; storeName: string; totalCents: number };

const byName = (a: string, b: string) => a.localeCompare(b, "fr");

export function topProducts(purchases: StatPurchase[], by: "spend" | "quantity", limit = 5): ProductRank[] {
  const ranks = new Map<string, ProductRank>();
  for (const line of purchases.flatMap((purchase) => purchase.lines)) {
    const rank = ranks.get(line.productId) ?? { productId: line.productId, productName: line.productName, spendCents: 0, quantity: 0 };
    rank.spendCents += lineNet(line);
    // Quantities have at most 3 decimals: round away float noise (0.1 + 0.2).
    rank.quantity = Math.round((rank.quantity + line.quantity) * 1000) / 1000;
    ranks.set(line.productId, rank);
  }
  const value = (rank: ProductRank) => (by === "spend" ? rank.spendCents : rank.quantity);
  return [...ranks.values()].sort((a, b) => value(b) - value(a) || byName(a.productName, b.productName)).slice(0, limit);
}

export function spendPerStore(purchases: StatPurchase[]): StoreSpend[] {
  const stores = new Map<string, StoreSpend>();
  for (const purchase of purchases) {
    const store = stores.get(purchase.storeId) ?? { storeId: purchase.storeId, storeName: purchase.storeName, totalCents: 0 };
    store.totalCents += purchase.totalCents;
    stores.set(purchase.storeId, store);
  }
  return [...stores.values()].sort((a, b) => b.totalCents - a.totalCents || byName(a.storeName, b.storeName));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/domain/statistics.ts src/domain/statistics.test.ts
git commit -m "feat(dashboard): rank top products and spend per store"
```

---

### Task 4: Savings vs the highest price

**Files:**
- Modify: `src/domain/statistics.ts`
- Test: `src/domain/statistics.test.ts`

**Interfaces:**
- Consumes: `StatPurchase` (Task 2); `PriceObservationInput` (`{ storeId, priceCents, observedAt, createdAt }`) and `latestPricesByStore(observations): StorePrice[]` from `src/domain/latest-prices.ts`; `multiplyByQuantity(quantity, cents)` from `src/domain/line-amount.ts`.
- Produces:

```ts
export type ProductObservation = PriceObservationInput & { productId: string };
export function savingsVsHighestPrice(purchases: StatPurchase[], observations: ProductObservation[]): number;
```

- [ ] **Step 1: Write the failing tests**

Add `type ProductObservation` and `savingsVsHighestPrice` to the import from `./statistics`, then append. The table matches spec §3.4.

```ts
describe("savingsVsHighestPrice", () => {
  const seen = (storeId: string, priceCents: number, iso: string, productId = "penne"): ProductObservation => ({
    productId,
    storeId,
    priceCents,
    observedAt: day(iso),
    createdAt: day(iso),
  });
  // Penne, bought on 2026-10-10 at Lidl ("A"), 2 × 1,00 €; Lidl's own price is the purchase's observation.
  const bought = (overrides: Partial<StatLine> = {}) =>
    purchase({ purchasedAt: day("2026-10-10"), lines: [line({ quantity: 2, unitPriceCents: 100, ...overrides })] });
  const own = seen("lidl", 100, "2026-10-10");

  it("saves nothing when only one store has a price", () => {
    expect(savingsVsHighestPrice([bought()], [own])).toBe(0);
  });

  it("saves the gap with the most expensive store, times the quantity", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-01")])).toBe(60);
  });

  it("uses each store's latest price as of the purchase date", () => {
    const observations = [own, seen("auchan", 130, "2026-10-01"), seen("auchan", 110, "2026-10-05")];
    expect(savingsVsHighestPrice([bought()], observations)).toBe(20);
  });

  it("ignores prices recorded after the purchase", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-12")])).toBe(0);
  });

  it("never counts a negative saving when the store was already the most expensive", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 90, "2026-10-01")])).toBe(0);
  });

  it("compares the regular price, leaving promotions to their own indicator", () => {
    const line = bought({ promo: { kind: "PERCENT_OFF", percent: 30 } });
    expect(savingsVsHighestPrice([line], [own, seen("auchan", 130, "2026-10-01")])).toBe(60);
  });

  it("rounds loose quantities half up", () => {
    const loose = bought({ quantity: 1.5, unitPriceCents: 200 });
    expect(savingsVsHighestPrice([loose], [seen("lidl", 200, "2026-10-10"), seen("auchan", 235, "2026-10-01")])).toBe(53);
  });

  it("evaluates each purchase against its own date", () => {
    const early = purchase({ purchasedAt: day("2026-10-03"), lines: [line({ quantity: 2 })] });
    const observations = [seen("lidl", 100, "2026-10-03"), own, seen("auchan", 130, "2026-10-05")];
    expect(savingsVsHighestPrice([early, bought()], observations)).toBe(60);
  });

  it("only uses prices of the same product", () => {
    expect(savingsVsHighestPrice([bought()], [own, seen("auchan", 130, "2026-10-01", "riz")])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: FAIL with "savingsVsHighestPrice is not a function".

- [ ] **Step 3: Write the implementation**

Add these imports at the top of `src/domain/statistics.ts`:

```ts
import { latestPricesByStore, type PriceObservationInput } from "./latest-prices";
import { multiplyByQuantity } from "./line-amount";
```

Then append:

```ts
export type ProductObservation = PriceObservationInput & { productId: string };

/** Spec §5.6: against the highest current price as of the purchase date, when at least two stores have one. */
export function savingsVsHighestPrice(purchases: StatPurchase[], observations: ProductObservation[]): number {
  const byProduct = Map.groupBy(observations, (observation) => observation.productId);
  let saved = 0;
  for (const purchase of purchases) {
    for (const line of purchase.lines) {
      const known = (byProduct.get(line.productId) ?? []).filter((o) => o.observedAt.getTime() <= purchase.purchasedAt.getTime());
      const prices = latestPricesByStore(known);
      if (prices.length < 2) continue;
      const reference = Math.max(...prices.map((price) => price.priceCents));
      saved += multiplyByQuantity(line.quantity, Math.max(0, reference - line.unitPriceCents));
    }
  }
  return saved;
}
```

If `pnpm typecheck` rejects `Map.groupBy` (the `lib` in `tsconfig.json` is `esnext`, so it should not), replace it with a plain `Map` filled in a `for` loop. Don't change `tsconfig.json`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/domain/statistics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/domain/statistics.ts src/domain/statistics.test.ts
git commit -m "feat(dashboard): compute savings against the highest store price"
```

---

### Task 5: Statistics repository

**Files:**
- Modify: `src/server/repositories/purchases.ts` (export `promoFromColumns`)
- Create: `src/server/repositories/statistics.ts`
- Test: `src/server/repositories/statistics.test.ts`

**Interfaces:**
- Consumes: `StatPurchase`, `MonthTotal`, `ProductObservation` from `src/domain/statistics.ts`; `db()` from `src/server/db.ts`; `createPurchase(input: PurchaseInput)` (in tests).
- Produces:

```ts
export async function listPurchasesForStats(start: Date, end: Date): Promise<StatPurchase[]>; // purchasedAt in [start, end)
export async function monthlyTotals(start: Date, end: Date): Promise<MonthTotal[]>;           // months with purchases only, oldest first
export async function listObservationsForProducts(productIds: string[], until: Date): Promise<ProductObservation[]>; // observedAt < until
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/repositories/statistics.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createPurchase } from "./purchases";
import { listObservationsForProducts, listPurchasesForStats, monthlyTotals } from "./statistics";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  const buy = (iso: string, totalCents: number, productId = penne.id) =>
    createPurchase({
      storeId: lidl.id,
      purchasedAt: day(iso),
      totalCents,
      receiptPath: null,
      lines: [{ productId, quantity: 1, unitPriceCents: totalCents }],
    });
  return { lidl, penne, apples, buy };
}

describe("listPurchasesForStats", () => {
  it("keeps the purchases from the first to the last day of the range", async () => {
    const { buy } = await setup();
    await buy("2026-09-30", 1);
    await buy("2026-10-01", 2);
    await buy("2026-10-31", 3);
    await buy("2026-11-01", 4);
    const purchases = await listPurchasesForStats(day("2026-10-01"), day("2026-11-01"));
    expect(purchases.map((p) => p.totalCents)).toEqual([2, 3]);
  });

  it("gives the store, the product names, decimal quantities and promotions", async () => {
    const { lidl, penne, apples } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-10"),
      totalCents: 439,
      receiptPath: null,
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99, promo: { kind: "BUY_GET_FREE", buy: 1, free: 1 } },
        { productId: apples.id, quantity: 1.5, unitPriceCents: 249 },
      ],
    });
    const [purchase] = await listPurchasesForStats(day("2026-10-01"), day("2026-11-01"));
    expect(purchase).toMatchObject({ storeId: lidl.id, storeName: "Lidl", totalCents: 439 });
    expect(purchase?.purchasedAt.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(purchase?.lines).toEqual(
      expect.arrayContaining([
        { productId: penne.id, productName: "Penne", quantity: 2, unitPriceCents: 99, promo: { kind: "BUY_GET_FREE", buy: 1, free: 1 } },
        { productId: apples.id, productName: "Pommes", quantity: 1.5, unitPriceCents: 249, promo: null },
      ]),
    );
  });
});

describe("monthlyTotals", () => {
  it("adds up the totals paid per calendar month inside the range", async () => {
    const { buy } = await setup();
    await buy("2026-08-31", 1000);
    await buy("2026-09-01", 200);
    await buy("2026-09-30", 300);
    await buy("2026-10-31", 400);
    await buy("2026-11-01", 5000);
    expect(await monthlyTotals(day("2026-09-01"), day("2026-11-01"))).toEqual([
      { month: "2026-09", totalCents: 500 },
      { month: "2026-10", totalCents: 400 },
    ]);
  });
});

describe("listObservationsForProducts", () => {
  it("returns the prices of the given products observed before the end of the range", async () => {
    const { lidl, penne, apples, buy } = await setup();
    await buy("2026-10-10", 99);
    await buy("2026-10-12", 249, apples.id);
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: lidl.id, priceCents: 120, observedAt: day("2026-11-01"), source: "MANUAL" },
    });
    const observations = await listObservationsForProducts([penne.id], day("2026-11-01"));
    expect(observations.map((o) => [o.productId, o.storeId, o.priceCents, o.observedAt.toISOString()])).toEqual([
      [penne.id, lidl.id, 99, "2026-10-10T00:00:00.000Z"],
    ]);
    expect(observations[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("returns nothing for no product", async () => {
    expect(await listObservationsForProducts([], day("2026-11-01"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/repositories/statistics.test.ts` (Docker must be running for Testcontainers.)
Expected: FAIL with "Failed to resolve import "./statistics"".

- [ ] **Step 3: Export the promotion mapping**

In `src/server/repositories/purchases.ts`, change `function promoFromColumns(row: PromoColumns): Promo | null {` to `export function promoFromColumns(row: PromoColumns): Promo | null {` and `type PromoColumns = {` to `export type PromoColumns = {`.

- [ ] **Step 4: Write the repository**

```ts
// src/server/repositories/statistics.ts
import "server-only";
import type { MonthTotal, ProductObservation, StatPurchase } from "@/domain/statistics";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { promoFromColumns } from "./purchases";

const lineSelect = {
  productId: true,
  quantity: true,
  unitPriceCents: true,
  promoKind: true,
  promoAmountCents: true,
  promoPercent: true,
  promoNth: true,
  promoBuy: true,
  promoFree: true,
  product: { select: { name: true } },
} as const satisfies Prisma.PurchaseItemSelect;

export async function listPurchasesForStats(start: Date, end: Date): Promise<StatPurchase[]> {
  const rows = await db().purchase.findMany({
    where: { purchasedAt: { gte: start, lt: end } },
    select: {
      purchasedAt: true,
      totalCents: true,
      store: { select: { id: true, name: true } },
      items: { select: lineSelect, orderBy: { id: "asc" } },
    },
    orderBy: [{ purchasedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(({ purchasedAt, totalCents, store, items }) => ({
    purchasedAt,
    totalCents,
    storeId: store.id,
    storeName: store.name,
    lines: items.map(({ productId, quantity, unitPriceCents, product, ...columns }) => ({
      productId,
      productName: product.name,
      quantity: quantity.toNumber(),
      unitPriceCents,
      promo: promoFromColumns(columns),
    })),
  }));
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function monthlyTotals(start: Date, end: Date): Promise<MonthTotal[]> {
  // Bounds are sent as plain dates: a timestamptz parameter would be compared in the
  // database session's time zone and shift the month edges.
  const rows = await db().$queryRaw<{ month: string; total: bigint }[]>`
    SELECT to_char(purchased_at, 'YYYY-MM') AS month, SUM(total_cents) AS total
    FROM purchases
    WHERE purchased_at >= ${isoDay(start)}::date AND purchased_at < ${isoDay(end)}::date
    GROUP BY 1
    ORDER BY 1`;
  return rows.map((row) => ({ month: row.month, totalCents: Number(row.total) }));
}

export async function listObservationsForProducts(productIds: string[], until: Date): Promise<ProductObservation[]> {
  if (productIds.length === 0) return [];
  return db().priceObservation.findMany({
    where: { productId: { in: productIds }, observedAt: { lt: until } },
    select: { productId: true, storeId: true, priceCents: true, observedAt: true, createdAt: true },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/repositories/statistics.test.ts src/server/repositories/purchases.test.ts`
Expected: PASS. If `SUM` comes back as a `Decimal` or `number` instead of a `bigint` with the pg adapter, `Number(row.total)` still converts it. Fix the type annotation to match what the test shows, and don't change the cast.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/server/repositories/statistics.ts src/server/repositories/statistics.test.ts src/server/repositories/purchases.ts
git commit -m "feat(dashboard): load purchases, monthly totals and prices for statistics"
```

---

### Task 6: Dashboard loader

**Files:**
- Create: `src/server/dashboard.ts`
- Test: `src/server/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 1 (`lastTwelveMonths`, `monthRange`, `previousMonth`), Tasks 2–4 (domain functions and types), Task 5 (repository), and `monthKey(date: Date): string` from `src/lib/purchase-months.ts`.
- Produces:

```ts
export type Dashboard = {
  month: string;
  previousMonth: string;
  purchaseCount: number;
  totalCents: number;
  changePercent: number | null;
  averageBasketCents: number;
  promotionSavingsCents: number;
  priceSavingsCents: number;
  months: MonthTotal[];          // always 12, oldest first, ends with `month`
  topBySpend: ProductRank[];
  topByQuantity: ProductRank[];
  stores: StoreSpend[];
};
export async function loadDashboard(month: string): Promise<Dashboard>;
```

This file is not named in the spec. It holds the assembly the spec gave to the page (§5), so that async Server Components stay untested glue and the logic is covered by an integration test.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/dashboard.test.ts
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { loadDashboard } from "./dashboard";
import { createPurchase } from "./repositories/purchases";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const auchan = await db().store.create({ data: { name: "Auchan", nameKey: "auchan" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const rice = await db().product.create({ data: { name: "Riz", sizeValue: 1000, sizeUnit: "G" } });
  return { lidl, auchan, penne, rice };
}

describe("loadDashboard", () => {
  it("gathers the indicators, rankings and savings of the month", async () => {
    const { lidl, auchan, penne, rice } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-09-20"),
      totalCents: 300,
      receiptPath: null,
      lines: [{ productId: rice.id, quantity: 1, unitPriceCents: 300 }],
    });
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: auchan.id, priceCents: 130, observedAt: day("2026-10-01"), source: "MANUAL" },
    });
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-10"),
      totalCents: 140,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 2, unitPriceCents: 100, promo: { kind: "PERCENT_OFF", percent: 30 } }],
    });
    await createPurchase({
      storeId: auchan.id,
      purchasedAt: day("2026-10-31"),
      totalCents: 250,
      receiptPath: null,
      lines: [{ productId: rice.id, quantity: 1, unitPriceCents: 250 }],
    });

    const dashboard = await loadDashboard("2026-10");

    expect(dashboard).toMatchObject({
      month: "2026-10",
      previousMonth: "2026-09",
      purchaseCount: 2,
      totalCents: 390,
      changePercent: 30,
      averageBasketCents: 195,
      promotionSavingsCents: 60,
      // Penne: Auchan 1,30 € vs 1,00 € paid × 2 = 60. Riz: Lidl's 3,00 € from September vs 2,50 € paid = 50.
      priceSavingsCents: 110,
    });
    expect(dashboard.topBySpend.map((p) => [p.productName, p.spendCents])).toEqual([["Riz", 250], ["Penne", 140]]);
    expect(dashboard.topByQuantity.map((p) => [p.productName, p.quantity])).toEqual([["Penne", 2], ["Riz", 1]]);
    expect(dashboard.stores.map((s) => [s.storeName, s.totalCents])).toEqual([["Auchan", 250], ["Lidl", 140]]);
    expect(dashboard.months).toHaveLength(12);
    expect(dashboard.months.slice(-2)).toEqual([
      { month: "2026-09", totalCents: 300 },
      { month: "2026-10", totalCents: 390 },
    ]);
    expect(dashboard.months[0]).toEqual({ month: "2025-11", totalCents: 0 });
  });

  it("describes an empty month with no change and 12 empty months", async () => {
    const dashboard = await loadDashboard("2026-10");
    expect(dashboard).toMatchObject({ purchaseCount: 0, totalCents: 0, changePercent: null, averageBasketCents: 0 });
    expect(dashboard.months.every((m) => m.totalCents === 0)).toBe(true);
    expect(dashboard.topBySpend).toEqual([]);
    expect(dashboard.stores).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/dashboard.test.ts`
Expected: FAIL with "Failed to resolve import "./dashboard"".

- [ ] **Step 3: Write the loader**

```ts
// src/server/dashboard.ts
import "server-only";
import {
  averageBasket,
  changeVsPrevious,
  fillMonths,
  type MonthTotal,
  type ProductRank,
  promotionSavings,
  savingsVsHighestPrice,
  spendPerStore,
  type StoreSpend,
  topProducts,
  totalSpent,
} from "@/domain/statistics";
import { lastTwelveMonths, monthRange, previousMonth } from "@/lib/months";
import { monthKey } from "@/lib/purchase-months";
import { listObservationsForProducts, listPurchasesForStats, monthlyTotals } from "./repositories/statistics";

export type Dashboard = {
  month: string;
  previousMonth: string;
  purchaseCount: number;
  totalCents: number;
  changePercent: number | null;
  averageBasketCents: number;
  promotionSavingsCents: number;
  priceSavingsCents: number;
  months: MonthTotal[];
  topBySpend: ProductRank[];
  topByQuantity: ProductRank[];
  stores: StoreSpend[];
};

export async function loadDashboard(month: string): Promise<Dashboard> {
  const previous = previousMonth(month);
  const window = lastTwelveMonths(month);
  const { end } = monthRange(month);
  const [recent, totals] = await Promise.all([
    listPurchasesForStats(monthRange(previous).start, end),
    monthlyTotals(monthRange(window[0] ?? month).start, end),
  ]);
  const purchases = recent.filter((purchase) => monthKey(purchase.purchasedAt) === month);
  const previousPurchases = recent.filter((purchase) => monthKey(purchase.purchasedAt) === previous);
  const productIds = [...new Set(purchases.flatMap((purchase) => purchase.lines.map((line) => line.productId)))];
  const observations = await listObservationsForProducts(productIds, end);
  const totalCents = totalSpent(purchases);

  return {
    month,
    previousMonth: previous,
    purchaseCount: purchases.length,
    totalCents,
    changePercent: changeVsPrevious(totalCents, totalSpent(previousPurchases)),
    averageBasketCents: averageBasket(totalCents, purchases.length),
    promotionSavingsCents: promotionSavings(purchases),
    priceSavingsCents: savingsVsHighestPrice(purchases, observations),
    months: fillMonths(window, totals),
    topBySpend: topProducts(purchases, "spend"),
    topByQuantity: topProducts(purchases, "quantity"),
    stores: spendPerStore(purchases),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/server/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/server/dashboard.ts src/server/dashboard.test.ts
git commit -m "feat(dashboard): assemble the monthly dashboard from purchases and prices"
```

---

### Task 7: Month selector and indicator tiles

**Files:**
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`
- Create: `src/components/dashboard/month-selector.tsx`, `src/components/dashboard/indicator-tiles.tsx`
- Test: `src/components/dashboard/month-selector.test.tsx`, `src/components/dashboard/indicator-tiles.test.tsx`

**Interfaces:**
- Consumes: `previousMonth`, `nextMonth` (Task 1); `formatMonthLabel(month)` and `formatEuros(cents)` (existing).
- Produces:
  - `formatMonthName(month: string): string`: "septembre"
  - `formatChange(percent: number): string`: "+12 %", "−8 %", "0 %" (with a non-breaking space before `%`)
  - `<MonthSelector month: string current: string />`
  - `<IndicatorTiles totalCents changePercent previousMonth purchaseCount averageBasketCents promotionSavingsCents priceSavingsCents />` (all numbers, except `changePercent: number | null` and `previousMonth: string`)

- [ ] **Step 1: Write the failing format tests**

Append to `src/lib/format.test.ts`, and add `formatChange` and `formatMonthName` to its import from `./format`:

```ts
describe("formatMonthName", () => {
  it("names the month in lower case", () => {
    expect(formatMonthName("2026-09")).toBe("septembre");
    expect(formatMonthName("2026-04")).toBe("avril");
  });
});

describe("formatChange", () => {
  it("signs a rise and a drop with a typographic minus", () => {
    expect(formatChange(12)).toBe("+12 %");
    expect(formatChange(-8)).toBe("−8 %");
  });

  it("shows no sign when nothing changed", () => {
    expect(formatChange(0)).toBe("0 %");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL with "formatMonthName is not a function".

- [ ] **Step 3: Implement the format helpers**

Append to `src/lib/format.ts` (`NBSP` already exists there):

```ts
const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });

export function formatMonthName(month: string): string {
  return monthName.format(new Date(`${month}-01T00:00:00.000Z`));
}

export function formatChange(percent: number): string {
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return `${sign}${Math.abs(percent)}${NBSP}%`;
}
```

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing component tests**

```tsx
// src/components/dashboard/month-selector.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthSelector } from "./month-selector";

describe("MonthSelector", () => {
  it("names the month and links to the previous and next months", () => {
    render(<MonthSelector month="2026-09" current="2026-10" />);
    expect(screen.getByRole("heading", { level: 1, name: "Septembre 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mois précédent" })).toHaveAttribute("href", "/?month=2026-08");
    expect(screen.getByRole("link", { name: "Mois suivant" })).toHaveAttribute("href", "/?month=2026-10");
  });

  it("cannot go past the current month", () => {
    render(<MonthSelector month="2026-10" current="2026-10" />);
    expect(screen.queryByRole("link", { name: "Mois suivant" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  });
});
```

```tsx
// src/components/dashboard/indicator-tiles.test.tsx
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { IndicatorTiles } from "./indicator-tiles";

const props: ComponentProps<typeof IndicatorTiles> = {
  totalCents: 39000,
  changePercent: 30,
  previousMonth: "2026-09",
  purchaseCount: 2,
  averageBasketCents: 19500,
  promotionSavingsCents: 60,
  priceSavingsCents: 125,
};
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");
const tile = (name: string) => plain(screen.getByRole("group", { name }).textContent);

describe("IndicatorTiles", () => {
  it("shows the total spent and its change vs the previous month", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Dépensé")).toContain("390,00 €");
    expect(tile("Dépensé")).toContain("+30 % vs septembre");
  });

  it("hides the change when the previous month has nothing to compare with", () => {
    render(<IndicatorTiles {...props} changePercent={null} />);
    expect(tile("Dépensé")).not.toContain("vs septembre");
  });

  it("shows the purchase count and the average basket", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Courses")).toContain("2");
    expect(tile("Courses")).toContain("Panier moyen 195,00 €");
  });

  it("shows the money saved, split into promotions and the highest price", () => {
    render(<IndicatorTiles {...props} />);
    expect(tile("Économisé")).toContain("1,85 €");
    expect(tile("Économisé")).toContain("Promotions0,60 €");
    expect(tile("Économisé")).toContain("Prix le plus haut1,25 €");
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm vitest run src/components/dashboard`
Expected: FAIL with "Failed to resolve import "./month-selector"" and the same for "./indicator-tiles".

- [ ] **Step 6: Write the components**

```tsx
// src/components/dashboard/month-selector.tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatMonthLabel } from "@/lib/format";
import { nextMonth, previousMonth } from "@/lib/months";

const control = "grid size-11 place-items-center rounded-md border bg-card";

export function MonthSelector({ month, current }: { month: string; current: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href={`/?month=${previousMonth(month)}`} aria-label="Mois précédent" className={control}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <h1 className="text-2xl">{formatMonthLabel(month)}</h1>
      {month < current ? (
        <Link href={`/?month=${nextMonth(month)}`} aria-label="Mois suivant" className={control}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <button type="button" disabled aria-label="Mois suivant" className={`${control} opacity-40`}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
```

```tsx
// src/components/dashboard/indicator-tiles.tsx
import type { ReactNode } from "react";
import { formatEuros } from "@/domain/money";
import { formatChange, formatMonthName } from "@/lib/format";

type Props = {
  totalCents: number;
  changePercent: number | null;
  previousMonth: string;
  purchaseCount: number;
  averageBasketCents: number;
  promotionSavingsCents: number;
  priceSavingsCents: number;
};

function Tile({ title, children }: { title: string; children: ReactNode }) {
  const id = `tile-${title}`;
  return (
    <div role="group" aria-labelledby={id} className="receipt-edge grid content-start gap-1 rounded-md border bg-card p-4">
      <h2 id={id} className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Amount({ cents, className }: { cents: number; className?: string }) {
  return <p className={`font-mono text-2xl font-bold ${className ?? ""}`}>{formatEuros(cents)}</p>;
}

function Detail({ label, cents }: { label: string; cents: number }) {
  return (
    <p className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{formatEuros(cents)}</span>
    </p>
  );
}

export function IndicatorTiles(props: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile title="Dépensé">
        <Amount cents={props.totalCents} />
        {props.changePercent !== null && (
          <p className="text-sm">
            <span className="font-mono">{formatChange(props.changePercent)}</span> vs {formatMonthName(props.previousMonth)}
          </p>
        )}
      </Tile>
      <Tile title="Courses">
        <p className="font-mono text-2xl font-bold">{props.purchaseCount}</p>
        <p className="text-sm text-muted-foreground">
          Panier moyen <span className="font-mono">{formatEuros(props.averageBasketCents)}</span>
        </p>
      </Tile>
      <Tile title="Économisé">
        <Amount cents={props.promotionSavingsCents + props.priceSavingsCents} className="text-savings" />
        <Detail label="Promotions" cents={props.promotionSavingsCents} />
        <Detail label="Prix le plus haut" cents={props.priceSavingsCents} />
      </Tile>
    </div>
  );
}
```

`Tile` ids contain accented characters ("tile-Économisé"). They are valid HTML ids and work with `aria-labelledby`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/dashboard src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/lib/format.ts src/lib/format.test.ts src/components/dashboard
git commit -m "feat(dashboard): add the month selector and indicator tiles"
```

---

### Task 8: Top products and spend per store

**Files:**
- Create: `src/components/dashboard/top-products.tsx`, `src/components/dashboard/store-spend.tsx`
- Test: `src/components/dashboard/top-products.test.tsx`, `src/components/dashboard/store-spend.test.tsx`

**Interfaces:**
- Consumes: `ProductRank`, `StoreSpend` (Task 3); `formatEuros`, `formatQuantity` (existing).
- Produces: `<TopProducts bySpend: ProductRank[] byQuantity: ProductRank[] />` (client) and `<StoreSpendBars stores: StoreSpend[] />` (server, in `store-spend.tsx`). It is not named `StoreSpend`, to avoid clashing with the domain type.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/dashboard/top-products.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TopProducts } from "./top-products";

const penne = { productId: "penne", productName: "Penne", spendCents: 140, quantity: 2 };
const rice = { productId: "riz", productName: "Riz", spendCents: 250, quantity: 1.5 };
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");
const rows = () =>
  within(screen.getByRole("list", { name: "Produits les plus achetés" }))
    .getAllByRole("link")
    .map((link) => plain(link.textContent));

describe("TopProducts", () => {
  it("ranks products by spend by default, linking to each product", () => {
    render(<TopProducts bySpend={[rice, penne]} byQuantity={[penne, rice]} />);
    expect(screen.getByRole("button", { name: "Dépense" })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toEqual(["Riz2,50 €", "Penne1,40 €"]);
    expect(screen.getByRole("link", { name: /Riz/ })).toHaveAttribute("href", "/products/riz");
  });

  it("switches to the ranking by quantity", async () => {
    render(<TopProducts bySpend={[rice, penne]} byQuantity={[penne, rice]} />);
    await userEvent.click(screen.getByRole("button", { name: "Quantité" }));
    expect(screen.getByRole("button", { name: "Quantité" })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toEqual(["Penne× 2", "Riz× 1,5"]);
  });
});
```

```tsx
// src/components/dashboard/store-spend.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreSpendBars } from "./store-spend";

const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("StoreSpendBars", () => {
  it("lists each store with what was spent there, highest first", () => {
    render(
      <StoreSpendBars
        stores={[
          { storeId: "auchan", storeName: "Auchan", totalCents: 25000 },
          { storeId: "lidl", storeName: "Lidl", totalCents: 14000 },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").map((item) => plain(item.textContent));
    expect(items).toEqual(["Auchan250,00 €", "Lidl140,00 €"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/components/dashboard`
Expected: FAIL with "Failed to resolve import "./top-products"" and the same for "./store-spend".

- [ ] **Step 3: Write the components**

```tsx
// src/components/dashboard/top-products.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEuros } from "@/domain/money";
import { formatQuantity } from "@/domain/purchase";
import type { ProductRank } from "@/domain/statistics";

type Ranking = "spend" | "quantity";
const RANKINGS: { value: Ranking; label: string }[] = [
  { value: "spend", label: "Dépense" },
  { value: "quantity", label: "Quantité" },
];

export function TopProducts({ bySpend, byQuantity }: { bySpend: ProductRank[]; byQuantity: ProductRank[] }) {
  const [ranking, setRanking] = useState<Ranking>("spend");
  const products = ranking === "spend" ? bySpend : byQuantity;

  return (
    <section aria-labelledby="top-products-title" className="grid gap-3 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="top-products-title" className="text-lg">
          Produits les plus achetés
        </h2>
        <div className="flex gap-1">
          {RANKINGS.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={ranking === value ? "default" : "outline"}
              aria-pressed={ranking === value}
              className="h-11"
              onClick={() => setRanking(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <ol aria-label="Produits les plus achetés" className="divide-y divide-dashed">
        {products.map((product) => (
          <li key={product.productId}>
            <Link href={`/products/${product.productId}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span className="truncate">{product.productName}</span>
              <span className="font-mono">
                {ranking === "spend" ? formatEuros(product.spendCents) : `× ${formatQuantity(product.quantity)}`}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

```tsx
// src/components/dashboard/store-spend.tsx
import { formatEuros } from "@/domain/money";
import type { StoreSpend } from "@/domain/statistics";

export function StoreSpendBars({ stores }: { stores: StoreSpend[] }) {
  const largest = Math.max(1, ...stores.map((store) => store.totalCents));

  return (
    <section aria-labelledby="store-spend-title" className="grid gap-3 rounded-md border bg-card p-4">
      <h2 id="store-spend-title" className="text-lg">
        Dépenses par magasin
      </h2>
      <ul className="grid gap-3">
        {stores.map((store) => (
          <li key={store.storeId} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate font-semibold">{store.storeName}</span>
              <span className="font-mono">{formatEuros(store.totalCents)}</span>
            </div>
            <div aria-hidden className="h-2 rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(store.totalCents / largest) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/dashboard
git commit -m "feat(dashboard): show top products and spend per store"
```

---

### Task 9: 12-month bar chart

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (add `recharts`), `src/lib/format.ts`, `src/lib/format.test.ts`
- Create: `src/components/dashboard/monthly-chart.tsx`
- Test: `src/components/dashboard/monthly-chart.test.tsx`

**Interfaces:**
- Consumes: `MonthTotal` (Task 2); `formatMonthLabel`, `formatEuros` (existing).
- Produces: `formatShortMonth(month: string): string` ("oct.") and `<MonthlyChart months: MonthTotal[] selected: string />` (client).

- [ ] **Step 1: Add Recharts**

Run: `pnpm add recharts@^3`
Expected: `recharts 3.x` is added to `dependencies`. If pnpm warns about a missing `react-is` peer, run `pnpm add react-is@19.2.8` (the same version as `react`).

- [ ] **Step 2: Write the failing format test**

Append to `src/lib/format.test.ts`, and add `formatShortMonth` to its import:

```ts
describe("formatShortMonth", () => {
  it("abbreviates the month for chart axes", () => {
    expect(formatShortMonth("2026-10")).toBe("oct.");
    expect(formatShortMonth("2026-05")).toBe("mai");
  });
});
```

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL with "formatShortMonth is not a function".

- [ ] **Step 3: Implement it**

Append to `src/lib/format.ts`:

```ts
const shortMonth = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

export function formatShortMonth(month: string): string {
  return shortMonth.format(new Date(`${month}-01T00:00:00.000Z`));
}
```

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing chart tests**

```tsx
// src/components/dashboard/monthly-chart.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { lastTwelveMonths } from "@/lib/months";
import { MonthlyChart } from "./monthly-chart";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const months = lastTwelveMonths("2026-10").map((month) => ({ month, totalCents: month === "2026-09" ? 30000 : 0 }));
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("MonthlyChart", () => {
  it("lists the 12 months and their totals for screen readers, empty months included", () => {
    render(<MonthlyChart months={months} selected="2026-10" />);
    const table = screen.getByRole("table", { name: "Dépenses des 12 derniers mois" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => plain(row.textContent));
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("Novembre 20250,00 €");
    expect(rows[10]).toBe("Septembre 2026300,00 €");
  });

  it("opens a month when its bar is clicked", async () => {
    const { container } = render(<MonthlyChart months={months} selected="2026-10" />);
    // Recharts bars have no role: the class is the only handle on them.
    const bars = container.querySelectorAll(".recharts-bar-rectangle");
    expect(bars).toHaveLength(12);
    await userEvent.click(bars[10] as Element);
    expect(push).toHaveBeenCalledWith("/?month=2026-09");
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm vitest run src/components/dashboard/monthly-chart.test.tsx`
Expected: FAIL with "Failed to resolve import "./monthly-chart"".

- [ ] **Step 6: Write the chart**

Read `node_modules/recharts/types/component/ResponsiveContainer.d.ts` and `node_modules/recharts/types/cartesian/Bar.d.ts` first, to confirm `initialDimension` and the `onClick(data, index)` signature in the installed version.

```tsx
// src/components/dashboard/monthly-chart.tsx
"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from "recharts";
import { formatEuros } from "@/domain/money";
import type { MonthTotal } from "@/domain/statistics";
import { formatMonthLabel, formatShortMonth } from "@/lib/format";

export function MonthlyChart({ months, selected }: { months: MonthTotal[]; selected: string }) {
  const router = useRouter();
  const data = months.map((month) => ({ ...month, label: formatShortMonth(month.month) }));

  return (
    <section aria-labelledby="monthly-chart-title" className="grid gap-3 rounded-md border bg-card p-4">
      <h2 id="monthly-chart-title" className="text-lg">
        12 derniers mois
      </h2>
      {/* The table below carries the same data for screen readers and keyboard users. */}
      <div aria-hidden className="h-56">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 224 }}>
          <BarChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} fontSize={11} />
            <Bar
              dataKey="totalCents"
              radius={[3, 3, 0, 0]}
              minPointSize={2}
              cursor="pointer"
              onClick={(_entry, index) => {
                const target = months[index];
                if (target) router.push(`/?month=${target.month}`);
              }}
            >
              {data.map((month) => (
                <Cell key={month.month} fill={month.month === selected ? "var(--primary)" : "var(--chart-2)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Dépenses des 12 derniers mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Dépensé</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonthLabel(month.month)}</th>
              <td>{formatEuros(month.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

`minPointSize={2}` gives empty months a visible stub and keeps them clickable.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/dashboard/monthly-chart.test.tsx`
Expected: PASS.

If the bars don't render in jsdom (`bars` has length 0) even with `initialDimension`, delete only the "opens a month when its bar is clicked" test. Then add that check to the Playwright flow in Task 10, Step 3, after the dashboard assertions, in the **desktop** project:

```ts
if (testInfo.project.name === "desktop") {
  await page.locator(".recharts-bar-rectangle").nth(10).click();
  await expect(page).toHaveURL(new RegExp(`month=${previousMonthOf(month)}`));
}
```

Here `previousMonthOf` is `previousMonth` imported from `@/lib/months`.

- [ ] **Step 8: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add package.json pnpm-lock.yaml src/lib/format.ts src/lib/format.test.ts src/components/dashboard/monthly-chart.tsx src/components/dashboard/monthly-chart.test.tsx
git commit -m "feat(dashboard): chart spending over the last 12 months"
```

---

### Task 10: Dashboard page and end-to-end flow

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `firstParam` (`src/lib/search-params.ts`), `parseMonth` and `currentMonth` (Task 1), `loadDashboard` (Task 6), the components from Tasks 7–9, `EmptyState`, and `LogoutButton`.
- Produces: the `/` route.

- [ ] **Step 1: Write the failing end-to-end test**

```ts
// tests/e2e/dashboard.spec.ts
import { expect, test } from "@playwright/test";

const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

test("the dashboard shows a month's spending and savings", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  // A past month per project: the mobile and desktop runs share one database.
  const month = suffix === "mobile" ? "2025-03" : "2025-04";
  const monthLabel = suffix === "mobile" ? "Mars 2025" : "Avril 2025";
  const store = `Intermarché ${suffix}`;
  const product = `Farine ${suffix}`;

  await page.goto("/purchases/new");
  await page.getByRole("combobox", { name: "Magasin" }).click();
  await page.getByPlaceholder("Rechercher…").fill(store);
  await page.getByRole("option", { name: `Créer « ${store} »` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await page.getByLabel("Date").fill(`${month}-15`);

  await page.getByRole("combobox", { name: "Ajouter un article" }).click();
  await page.getByPlaceholder("Rechercher…").fill(product);
  await page.getByRole("option", { name: `Créer « ${product} »` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contenance").fill("1000");
  await dialog.getByLabel(`Prix chez ${store}`).fill("2,00");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("button", { name: "Augmenter" }).click();

  await page.getByRole("button", { name: `Ajouter une promo sur ${product}` }).click();
  await page.getByRole("button", { name: "− %" }).click();
  await page.getByLabel(`Pourcentage de remise pour ${product}`).fill("30");
  await page.getByRole("button", { name: `Valider la promo sur ${product}` }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("2,80");
  await page.getByRole("button", { name: "Enregistrer la course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: store })).toBeVisible();
  const detailUrl = page.url();

  await page.goto(`/?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: monthLabel })).toBeVisible();
  expect(plain(await page.getByRole("group", { name: "Dépensé" }).textContent())).toContain("2,80 €");
  expect(plain(await page.getByRole("group", { name: "Courses" }).textContent())).toContain("Panier moyen 2,80 €");
  expect(plain(await page.getByRole("group", { name: "Économisé" }).textContent())).toContain("Promotions1,20 €");
  await expect(page.getByRole("list", { name: "Produits les plus achetés" })).toContainText(product);
  await expect(page.getByRole("region", { name: "Dépenses par magasin" })).toContainText(store);

  await page.getByRole("link", { name: "Mois précédent" }).click();
  await expect(page.getByText("Aucune course ce mois-ci")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enregistrer une course" })).toHaveAttribute("href", "/purchases/new");

  await page.goto(detailUrl);
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page).toHaveURL(/\/purchases$/);
});

test("an invalid month falls back to the current month", async ({ page }) => {
  await page.goto("/?month=2026-13");
  await expect(page.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:e2e tests/e2e/dashboard.spec.ts`
Expected: FAIL. The heading `Mars 2025` is not found, because `/` still shows "Bienvenue dans cabas".

- [ ] **Step 3: Write the page**

Replace `src/app/(app)/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { EmptyState } from "@/components/common/empty-state";
import { IndicatorTiles } from "@/components/dashboard/indicator-tiles";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import { StoreSpendBars } from "@/components/dashboard/store-spend";
import { TopProducts } from "@/components/dashboard/top-products";
import { Button } from "@/components/ui/button";
import { currentMonth, parseMonth } from "@/lib/months";
import { firstParam } from "@/lib/search-params";
import { loadDashboard } from "@/server/dashboard";

export const metadata: Metadata = { title: "Accueil" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: Props) {
  const month = parseMonth(firstParam((await searchParams).month));
  const dashboard = await loadDashboard(month);

  return (
    <div className="grid gap-5">
      <MonthSelector month={month} current={currentMonth()} />
      {dashboard.purchaseCount === 0 ? (
        <EmptyState
          title="Aucune course ce mois-ci"
          description="Enregistre une course pour voir tes dépenses."
          action={
            <Button asChild>
              <Link href="/purchases/new">Enregistrer une course</Link>
            </Button>
          }
        />
      ) : (
        <>
          <IndicatorTiles
            totalCents={dashboard.totalCents}
            changePercent={dashboard.changePercent}
            previousMonth={dashboard.previousMonth}
            purchaseCount={dashboard.purchaseCount}
            averageBasketCents={dashboard.averageBasketCents}
            promotionSavingsCents={dashboard.promotionSavingsCents}
            priceSavingsCents={dashboard.priceSavingsCents}
          />
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <MonthlyChart months={dashboard.months} selected={month} />
            <div className="grid content-start gap-5">
              <TopProducts bySpend={dashboard.topBySpend} byQuantity={dashboard.topByQuantity} />
              <StoreSpendBars stores={dashboard.stores} />
            </div>
          </div>
        </>
      )}
      <LogoutButton className="justify-self-center lg:hidden" />
    </div>
  );
}
```

- [ ] **Step 4: Run the end-to-end tests to verify they pass**

Run: `pnpm test:e2e`
Expected: PASS on both the `mobile` and `desktop` projects, including the existing auth, catalog and purchase flows. No existing test asserts on the old "Bienvenue" home page.

- [ ] **Step 5: Check the layout by eye**

Run `pnpm dev`, log in, record a purchase, and open `/` at 390 px wide and at 1280 px wide. Expected: on mobile everything is stacked, with no horizontal scroll. On desktop the 3 tiles sit in a row, with the chart on the left and top products and stores on the right.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add "src/app/(app)/page.tsx" tests/e2e/dashboard.spec.ts
git commit -m "feat(dashboard): show the monthly dashboard on the home page"
```

---

### Task 11: Installable app (web app manifest)

**Files:**
- Modify: `src/lib/auth/access.ts`, `src/lib/auth/access.test.ts`
- Create: `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`
- Test: `tests/e2e/pwa.spec.ts`

**Interfaces:**
- Consumes: `isPublicPath(pathname: string): boolean` and `PUBLIC_FILES` in `src/lib/auth/access.ts`.
- Produces: `/manifest.webmanifest` and the three icons, all reachable without a session.

- [ ] **Step 1: Write the failing access test**

In `src/lib/auth/access.test.ts`, extend the `it.each([...])("lets anyone reach %s"` list with `"/manifest.webmanifest"`, `"/icons/icon-192.png"`, `"/icons/icon-512.png"` and `"/icons/icon-maskable-512.png"`. Then extend the `"does not treat %s as public"` list with `"/icons/other.png"`.

Run: `pnpm vitest run src/lib/auth/access.test.ts`
Expected: FAIL for `/manifest.webmanifest` and the three icons.

- [ ] **Step 2: Make them public**

In `src/lib/auth/access.ts`, replace the `PUBLIC_FILES` line:

```ts
/** Browsers fetch the manifest and install icons without cookies: they reveal only the app name and logo. */
const PUBLIC_FILES = new Set([
  "/login",
  "/icon.svg",
  "/apple-icon.png",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
]);
```

Run: `pnpm vitest run src/lib/auth/access.test.ts`
Expected: PASS.

- [ ] **Step 3: Generate the install icons**

The SVG favicon switches its handle colour with a media query that sharp ignores, so the icons are rendered with the light colours on the cream background. The maskable icon keeps the logo inside the central 60 % safe zone. Run this once from the repo root:

```bash
mkdir -p public/icons
node --input-type=module -e '
import { readFile } from "node:fs/promises";
import sharp from "sharp";
const source = (await readFile("src/app/icon.svg", "utf8"))
  .replace(/<style>[\s\S]*?<\/style>/, "")
  .replace(`class="handle"`, `stroke="#1c1917"`);
async function icon(size, logoShare, file) {
  const logoSize = Math.round(size * logoShare);
  const svg = source.replace("<svg ", `<svg width="${logoSize}" height="${logoSize}" `);
  const logo = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#fbf7f0" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(file);
}
await icon(192, 0.8, "public/icons/icon-192.png");
await icon(512, 0.8, "public/icons/icon-512.png");
await icon(512, 0.6, "public/icons/icon-maskable-512.png");
'
file public/icons/*.png
```

Expected: three PNG files, 192 × 192 and 512 × 512. Open them to check the bag logo is centered on cream.

- [ ] **Step 4: Write the failing end-to-end test**

```ts
// tests/e2e/pwa.spec.ts
import { expect, test } from "@playwright/test";

test("the app can be installed: its manifest and icons need no session", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const response = await anonymous.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "cabas", start_url: "/", display: "standalone", lang: "fr-FR" });
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await anonymous.get(icon.src, { maxRedirects: 0 });
    expect(image.status(), icon.src).toBe(200);
  }
  await anonymous.dispose();
});
```

Run: `pnpm test:e2e tests/e2e/pwa.spec.ts`
Expected: FAIL with status 404 (no manifest route yet).

- [ ] **Step 5: Write the manifest**

Re-read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`. Then:

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cabas",
    short_name: "cabas",
    description: "Suivi des courses et comparaison des prix",
    lang: "fr-FR",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#fbf7f0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:e2e tests/e2e/pwa.spec.ts && pnpm vitest run src/lib/auth/access.test.ts`
Expected: PASS. In Chrome DevTools › Application › Manifest on `pnpm dev`, the manifest loads with no errors and shows the icons.

- [ ] **Step 7: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/app/manifest.ts public/icons src/lib/auth/access.ts src/lib/auth/access.test.ts tests/e2e/pwa.spec.ts
git commit -m "feat(pwa): make the app installable with a web app manifest"
```

---

### Task 12: Backup script, README and roadmap

**Files:**
- Create: `scripts/backup.sh`
- Modify: `README.md`, `CLAUDE.md` (Commands), `docs/superpowers/plans/2026-10-03-cabas-roadmap.md`

**Interfaces:**
- Consumes: the `db` and `app` services and their environment from `docker-compose.yml` (`POSTGRES_USER` and `POSTGRES_DB` inside `db`; the uploads at `/data/uploads` inside `app`).
- Produces: `scripts/backup.sh [output-dir]`, which writes `cabas-db-YYYYMMDD-HHMM.dump` and `cabas-uploads-YYYYMMDD-HHMM.tar.gz` and prints their paths.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Backs up the cabas database (pg_dump custom format) and the uploaded images.
# Usage: scripts/backup.sh [output-dir]   (default: ./backups)
# Run it from the directory of the Compose project (see README, "Backup and restore").
set -euo pipefail

out_dir="${1:-./backups}"
stamp="$(date +%Y%m%d-%H%M)"
db_file="$out_dir/cabas-db-$stamp.dump"
uploads_file="$out_dir/cabas-uploads-$stamp.tar.gz"

mkdir -p "$out_dir"
# Never leave a half-written backup that looks complete.
trap 'rm -f "$db_file" "$uploads_file"' ERR

# Single quotes: the variables expand inside the db container, so no secret reaches this shell.
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$db_file"
# The app image's entrypoint ignores arguments, so stream from the running container instead of `compose run`.
docker compose exec -T app tar czf - -C /data uploads > "$uploads_file"

trap - ERR
echo "$db_file"
echo "$uploads_file"
```

Run: `chmod +x scripts/backup.sh`

- [ ] **Step 2: Lint the script**

Run: `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable scripts/backup.sh`
Expected: no output (exit 0).

- [ ] **Step 3: Verify a backup and a restore on the local production stack**

Follow the README section "Local test of the production stack" to start it with `docker compose up -d --build`. Then:

```bash
scripts/backup.sh /tmp/cabas-backup-check
ls -l /tmp/cabas-backup-check
docker compose exec -T db sh -c 'pg_restore --list' < /tmp/cabas-backup-check/cabas-db-*.dump | head -5
tar tzf /tmp/cabas-backup-check/cabas-uploads-*.tar.gz | head -5
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" restore_check && pg_restore -U "$POSTGRES_USER" -d restore_check' < /tmp/cabas-backup-check/cabas-db-*.dump
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c "select count(*) from purchases" && dropdb -U "$POSTGRES_USER" restore_check'
```

Expected:
- Two non-empty files are written.
- `pg_restore --list` prints the table of contents.
- The tar listing starts with `uploads/`.
- The restore check prints the same purchase count as the app.

Then stop the stack and remove `/tmp/cabas-backup-check`.

- [ ] **Step 4: Document backup, restore and installation in the README**

Add these sections to `README.md` after "Local test of the production stack":

````markdown
### Backup and restore

`scripts/backup.sh [output-dir]` writes a database dump (`cabas-db-YYYYMMDD-HHMM.dump`,
`pg_dump` custom format) and an archive of the uploaded images
(`cabas-uploads-YYYYMMDD-HHMM.tar.gz`), then prints their paths. Copy the script to the
server and run it from the Compose project directory. On Coolify, find that directory with:

```bash
docker inspect <app container> --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

Daily at 03:00, keeping 14 days (`crontab -e` on the server):

```cron
0 3 * * * cd /path/to/project && /usr/local/bin/cabas-backup.sh /srv/backups/cabas && find /srv/backups/cabas -name 'cabas-*' -mtime +14 -delete
```

Restore, from the same directory (this replaces the current data):

```bash
docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < cabas-db-YYYYMMDD-HHMM.dump
docker compose exec -T app sh -c 'rm -rf /data/uploads/* && tar xzf - -C /data' < cabas-uploads-YYYYMMDD-HHMM.tar.gz
docker compose restart app
```

### Install on a phone

The app has a web app manifest and can be added to the home screen. It needs the network:
there is no offline mode.

- iPhone (Safari): Partager › Sur l’écran d’accueil.
- Android (Chrome): menu ⋮ › Installer l’application.
````

- [ ] **Step 5: Update `CLAUDE.md` and the roadmap**

In the `CLAUDE.md` Commands block, add after `pnpm hash-password`:

```bash
scripts/backup.sh [dir]      # back up the database and uploads of the running stack
```

In `docs/superpowers/plans/2026-10-03-cabas-roadmap.md`, replace the plan 4 row with:

```markdown
| 4 | [Dashboard & release](2026-10-09-dashboard.md) | Monthly statistics, savings, charts, PWA manifest, README and backup | §5.6, §6.3, §3 (backup); [Dashboard spec](../specs/2026-10-09-dashboard-design.md) |
```

In `docs/superpowers/specs/2026-10-09-dashboard-design.md`, change `**Status:** Draft, awaiting review` to `**Status:** Approved`.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add scripts/backup.sh README.md CLAUDE.md docs/superpowers/plans/2026-10-03-cabas-roadmap.md docs/superpowers/specs/2026-10-09-dashboard-design.md
git commit -m "docs: document backup, restore and installing the app"
```

The script has no automated test, so `chmod +x` and the manual check in Step 3 are its verification. If you'd rather keep the script in its own commit, commit `scripts/backup.sh` first as `feat(ops): add a backup script for the database and uploads`.
