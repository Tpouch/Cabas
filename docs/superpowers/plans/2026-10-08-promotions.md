# cabas — Promotions on purchase lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user attach one promotion (− € per item, − %, "le Ne à −X %", "N achetés = M offerts") to a purchase line; the app computes the discount, the sum of lines and the prefilled total reflect it, and the purchase detail shows it, while price observations keep the regular price.

**Architecture:** The promotion's terms are stored as typed nullable columns on `PurchaseItem`, kept consistent by a SQL `CHECK` constraint. A pure module `src/domain/promo.ts` holds the `Promo` union and the discount rules; `src/domain/purchase.ts` sums net amounts. The client form keeps the promotion as typed strings in the draft (`src/lib/purchase-draft.ts`), computes it live, and sends it inside the existing `lines` JSON, validated by Zod in the Server Action.

**Tech Stack:** Next.js 16 (App Router), React 19.2, TypeScript strict, Prisma 7 + PostgreSQL 18, Tailwind 4 + shadcn/ui, Zod 4, Vitest + Testing Library + Testcontainers, Playwright, pnpm.

**Spec:** [`docs/superpowers/specs/2026-10-08-promotions-design.md`](../specs/2026-10-08-promotions-design.md) (amends [`2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md) §4, §5.4, §5.6, §6.3–6.5). Read `CLAUDE.md`, `AGENTS.md` and the Prisma, Zod and Testing sections of `docs/best-practices.md` first.

## Global Constraints

- pnpm only; no new dependency. TDD for every behavior: failing test first, watch it fail, minimal code, refactor.
- Amounts are integer cents, rounded half up; quantities have at most 3 decimals and are multiplied on thousandths (never `quantity * cents` directly).
- Promotion terms are stored, the discount is always computed (`lineDiscount`), never stored.
- `PriceObservation.priceCents` stays the **regular** `unitPriceCents`, promotion or not.
- Quantity counts every item taken, free ones included. "Le Ne" and "achetés/offerts" count whole items only (`wholeUnits`).
- Discount = `min(discount, gross)`; no promotion → 0.
- Ranges: `amountCents` 1 … `unitPriceCents`; `percent` 1–100; `nth` 2–10; `buy`, `free` 1–20; all integers.
- UI copy in French with the typographic apostrophe `’`; the minus sign in discounts is `−` (U+2212). Code, comments, docs in English.
- Mobile first, touch targets ≥ 44 px (`h-11` / `size-11`), prices in `font-mono`, savings in `text-savings`, "not reached" in `text-amber-700 dark:text-amber-400`.
- Business logic in `src/domain/` knows nothing about React, Prisma or Next.js.
- Never edit a committed migration; the new one is created with `pnpm prisma migrate dev --create-only`.
- Conventional Commits in English, **no mention of Claude or any AI, no `Co-Authored-By` line**.
- `pnpm lint && pnpm typecheck && pnpm test` pass before every commit.
- Work on branch `feat/promotions` (already created, the spec is committed there).

## Review Focus

1. **A promotion whose quantity is not reached** ("2 achetés = 1 offert" with 2 items, or a loose 1,5 kg line with "le 2e à −60 %"): the line keeps the promotion, the discount is 0, the line says « il faut 3 articles », and the total is the gross amount. Pinned in Tasks 1 and 6.
2. **A half-typed or out-of-range promotion at save time** (empty "offerts", 150 %, a discount above the unit price): no discount is applied live, the field is marked invalid, and saving is refused with the French message of the spec — the purchase is not written. Pinned in Tasks 4, 5 and 6.
3. **A draft saved before this change** (lines without `promo`) or a purchase recorded before it (null promotion columns): the form and the detail page open normally with no promotion. Pinned in Tasks 3 and 5.
4. **Editing a purchase to change or remove a promotion**: the new promotion (or none) replaces the old one, and the price observation keeps the regular price. Pinned in Task 3.
5. **Inconsistent promotion columns written outside the app** (a kind without its parameters, parameters of another kind): the database refuses them, including the case where a `NULL` would make a naive `CHECK` pass. Pinned in Task 3.

---

## File Structure

```
prisma/schema.prisma                              # + enum PromoKind, promo columns on PurchaseItem
prisma/migrations/<ts>_purchase_promotions/       # generated + hand-written CHECK constraint
src/domain/
  line-amount.ts        (new)                     # multiplyByQuantity, wholeUnits (thousandths math)
  promo.ts              (new)                     # Promo, PROMO_KINDS, PROMO_LIMITS, lineDiscount, isPromoValid, …
  purchase.ts                                     # PurchaseLine.promo, lineNet, sumOfLines (net), sumOfDiscounts
src/lib/
  format.ts                                       # + formatPromo, formatDiscount
  purchase-draft.ts                               # DraftPromo, readDraftPromo, promoToDraft, draftLinePayload, draftLineAmounts
src/server/
  repositories/purchases.ts                       # promo columns ↔ Promo
  actions/purchases.schema.ts                     # promo validation inside each line
src/components/purchases/
  promo-status.tsx      (new)                     # "🏷 label · −1,20 €" / "il faut 3 articles"
  promo-editor.tsx      (new)                     # "+ Promo", kind toggles, fields, OK, remove, summary
  lines-summary.tsx     (new)                     # Avant promos / Promos / Somme des articles rows
  purchase-lines.tsx                              # editor under each line, gross struck through + net
  purchase-form.tsx                               # net sum, summary rows, payload with promo
src/app/(app)/purchases/[id]/page.tsx             # promotion per line, summary rows
tests/e2e/purchase.spec.ts                        # promotion step in the purchase flow
```

---

### Task 1: Promotion rules in the domain

**Files:**
- Create: `src/domain/line-amount.ts`, `src/domain/line-amount.test.ts`
- Create: `src/domain/promo.ts`, `src/domain/promo.test.ts`
- Modify: `src/domain/purchase.ts:7-11` (`lineSubtotal` delegates to `multiplyByQuantity`)

**Interfaces:**
- Produces (`line-amount.ts`): `multiplyByQuantity(quantity: number, cents: number): number`, `wholeUnits(quantity: number): number`
- Produces (`promo.ts`):
  - `PROMO_KINDS = ["AMOUNT_OFF_PER_UNIT", "PERCENT_OFF", "NTH_PERCENT_OFF", "BUY_GET_FREE"] as const`, `type PromoKind`
  - `type Promo = { kind: "AMOUNT_OFF_PER_UNIT"; amountCents: number } | { kind: "PERCENT_OFF"; percent: number } | { kind: "NTH_PERCENT_OFF"; nth: number; percent: number } | { kind: "BUY_GET_FREE"; buy: number; free: number }`
  - `PROMO_LIMITS = { percent: {min:1,max:100}, nth: {min:2,max:10}, items: {min:1,max:20} }`
  - `inRange(value: number, range: { min: number; max: number }): boolean`
  - `isPromoValid(promo: Promo, unitPriceCents: number): boolean`
  - `lineDiscount(quantity: number, unitPriceCents: number, promo: Promo | null | undefined): number`
  - `promoMinimumQuantity(promo: Promo): number | null`, `isPromoReached(quantity: number, promo: Promo): boolean`
  - `parsePromoNumber(input: string): number | null`

`promo.ts` imports only `line-amount.ts`, and `purchase.ts` will import both (Task 2): no import cycle.

- [ ] **Step 1: Write the failing test for the thousandths helpers**

`src/domain/line-amount.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { multiplyByQuantity, wholeUnits } from "./line-amount";

describe("multiplyByQuantity", () => {
  it("multiplies on thousandths and rounds half up to the cent", () => {
    expect(multiplyByQuantity(1.005, 1000)).toBe(1005);
    expect(multiplyByQuantity(0.75, 250)).toBe(188);
  });
});

describe("wholeUnits", () => {
  it.each([
    [3, 3],
    [1.5, 1],
    [2.999, 2],
    [0.5, 0],
    [3.0000000000000004, 3],
  ])("counts %d as %d whole items", (quantity, expected) => {
    expect(wholeUnits(quantity)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/domain/line-amount.test.ts`
Expected: FAIL, cannot resolve `./line-amount`.

- [ ] **Step 3: Implement `line-amount.ts` and make `lineSubtotal` use it**

`src/domain/line-amount.ts`:

```ts
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
```

In `src/domain/purchase.ts`, replace the body and comment of `lineSubtotal`:

```ts
import { multiplyByQuantity } from "./line-amount";

// …

export function lineSubtotal(quantity: number, unitPriceCents: number): number {
  return multiplyByQuantity(quantity, unitPriceCents);
}
```

- [ ] **Step 4: Run the domain tests**

Run: `pnpm vitest run src/domain`
Expected: PASS (the existing `lineSubtotal` tests still pass).

- [ ] **Step 5: Write the failing promotion tests**

`src/domain/promo.test.ts` (unit price 1,20 € unless stated; rows are the spec §4 examples):

```ts
import { describe, expect, it } from "vitest";
import {
  isPromoReached,
  isPromoValid,
  lineDiscount,
  parsePromoNumber,
  type Promo,
  promoMinimumQuantity,
} from "./promo";

const amountOff: Promo = { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 };
const percentOff: Promo = { kind: "PERCENT_OFF", percent: 30 };
const secondAt60: Promo = { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 };
const twoPlusOne: Promo = { kind: "BUY_GET_FREE", buy: 2, free: 1 };
const twoPlusTwo: Promo = { kind: "BUY_GET_FREE", buy: 2, free: 2 };

describe("lineDiscount", () => {
  it.each([
    ["−0,50 € per item on 3 items", amountOff, 3, 150],
    ["−30 % on 3 items", percentOff, 3, 108],
    ["the 2nd at −60 % on 3 items", secondAt60, 3, 72],
    ["the 2nd at −60 % on 4 items", secondAt60, 4, 144],
    ["2 bought = 1 free on 2 items (not reached)", twoPlusOne, 2, 0],
    ["2 bought = 1 free on 3 items", twoPlusOne, 3, 120],
    ["2 bought = 1 free on 6 items", twoPlusOne, 6, 240],
    ["2 bought = 2 free on 3 items", twoPlusTwo, 3, 120],
    ["the 2nd at −60 % on a loose 1.5", secondAt60, 1.5, 0],
  ])("computes %s", (_, promo, quantity, expected) => {
    expect(lineDiscount(quantity, 120, promo)).toBe(expected);
  });

  it("gives no discount without a promotion", () => {
    expect(lineDiscount(3, 120, null)).toBe(0);
    expect(lineDiscount(3, 120, undefined)).toBe(0);
  });

  it("makes a line free at −100 %", () => {
    expect(lineDiscount(3, 120, { kind: "PERCENT_OFF", percent: 100 })).toBe(360);
  });

  it("never discounts more than the line amount", () => {
    expect(lineDiscount(1, 120, { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 200 })).toBe(120);
  });

  it("applies a per-item discount per kilo on a loose product", () => {
    expect(lineDiscount(1.5, 249, { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 })).toBe(75);
    expect(lineDiscount(1.5, 249, percentOff)).toBe(112); // 30 % of 374
  });

  it("rounds a percentage half up to the cent", () => {
    expect(lineDiscount(1, 105, { kind: "PERCENT_OFF", percent: 50 })).toBe(53); // 52.5
  });
});

describe("promoMinimumQuantity and isPromoReached", () => {
  it("needs N items for the Nth item and N + 1 for a free one", () => {
    expect(promoMinimumQuantity(secondAt60)).toBe(2);
    expect(promoMinimumQuantity(twoPlusOne)).toBe(3);
    expect(promoMinimumQuantity(percentOff)).toBeNull();
  });

  it("counts whole items only", () => {
    expect(isPromoReached(2, twoPlusOne)).toBe(false);
    expect(isPromoReached(3, twoPlusOne)).toBe(true);
    expect(isPromoReached(1.5, secondAt60)).toBe(false);
    expect(isPromoReached(0.4, amountOff)).toBe(true);
  });
});

describe("isPromoValid", () => {
  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 120 },
    { kind: "PERCENT_OFF", percent: 100 },
    { kind: "NTH_PERCENT_OFF", nth: 10, percent: 1 },
    { kind: "BUY_GET_FREE", buy: 20, free: 1 },
  ])("accepts %j", (promo) => {
    expect(isPromoValid(promo, 120)).toBe(true);
  });

  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 121 },
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 0 },
    { kind: "PERCENT_OFF", percent: 0 },
    { kind: "PERCENT_OFF", percent: 101 },
    { kind: "PERCENT_OFF", percent: 12.5 },
    { kind: "NTH_PERCENT_OFF", nth: 1, percent: 50 },
    { kind: "NTH_PERCENT_OFF", nth: 11, percent: 50 },
    { kind: "BUY_GET_FREE", buy: 0, free: 1 },
    { kind: "BUY_GET_FREE", buy: 2, free: 21 },
  ])("rejects %j", (promo) => {
    expect(isPromoValid(promo, 120)).toBe(false);
  });
});

describe("parsePromoNumber", () => {
  it.each([
    ["2", 2],
    [" 60 ", 60],
    ["100", 100],
  ])("parses %j", (input, expected) => {
    expect(parsePromoNumber(input)).toBe(expected);
  });

  it.each(["", "abc", "1,5", "-2", "1000"])("rejects %j", (input) => {
    expect(parsePromoNumber(input)).toBeNull();
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm vitest run src/domain/promo.test.ts`
Expected: FAIL, cannot resolve `./promo`.

- [ ] **Step 7: Implement `promo.ts`**

`src/domain/promo.ts`:

```ts
import { multiplyByQuantity, wholeUnits } from "./line-amount";

export const PROMO_KINDS = ["AMOUNT_OFF_PER_UNIT", "PERCENT_OFF", "NTH_PERCENT_OFF", "BUY_GET_FREE"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export type Promo =
  | { kind: "AMOUNT_OFF_PER_UNIT"; amountCents: number }
  | { kind: "PERCENT_OFF"; percent: number }
  | { kind: "NTH_PERCENT_OFF"; nth: number; percent: number }
  | { kind: "BUY_GET_FREE"; buy: number; free: number };

type Range = { min: number; max: number };

export const PROMO_LIMITS = {
  percent: { min: 1, max: 100 },
  nth: { min: 2, max: 10 },
  items: { min: 1, max: 20 },
} as const satisfies Record<string, Range>;

export function inRange(value: number, range: Range): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** A per-item discount cannot exceed the unit price. */
export function isPromoValid(promo: Promo, unitPriceCents: number): boolean {
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return inRange(promo.amountCents, { min: 1, max: unitPriceCents });
    case "PERCENT_OFF":
      return inRange(promo.percent, PROMO_LIMITS.percent);
    case "NTH_PERCENT_OFF":
      return inRange(promo.nth, PROMO_LIMITS.nth) && inRange(promo.percent, PROMO_LIMITS.percent);
    case "BUY_GET_FREE":
      return inRange(promo.buy, PROMO_LIMITS.items) && inRange(promo.free, PROMO_LIMITS.items);
  }
}

function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

function uncappedDiscount(quantity: number, unitPriceCents: number, promo: Promo): number {
  const units = wholeUnits(quantity);
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return multiplyByQuantity(quantity, promo.amountCents);
    case "PERCENT_OFF":
      return percentOf(multiplyByQuantity(quantity, unitPriceCents), promo.percent);
    case "NTH_PERCENT_OFF":
      return percentOf(Math.floor(units / promo.nth) * unitPriceCents, promo.percent);
    case "BUY_GET_FREE": {
      // Items are taken in groups of buy + free; a partial group gets the free items past `buy`.
      const group = promo.buy + promo.free;
      const freeItems = Math.floor(units / group) * promo.free + Math.max(0, (units % group) - promo.buy);
      return freeItems * unitPriceCents;
    }
  }
}

/** Never more than the line amount; no promotion, no discount. */
export function lineDiscount(quantity: number, unitPriceCents: number, promo: Promo | null | undefined): number {
  if (!promo) return 0;
  return Math.min(uncappedDiscount(quantity, unitPriceCents, promo), multiplyByQuantity(quantity, unitPriceCents));
}

export function promoMinimumQuantity(promo: Promo): number | null {
  switch (promo.kind) {
    case "NTH_PERCENT_OFF":
      return promo.nth;
    case "BUY_GET_FREE":
      return promo.buy + 1;
    default:
      return null;
  }
}

export function isPromoReached(quantity: number, promo: Promo): boolean {
  const minimum = promoMinimumQuantity(promo);
  return minimum === null || wholeUnits(quantity) >= minimum;
}

const WHOLE_NUMBER = /^\d{1,3}$/;

/** A typed percentage, rank or item count; null when it is not a whole number. */
export function parsePromoNumber(input: string): number | null {
  const compact = input.trim();
  return WHOLE_NUMBER.test(compact) ? Number(compact) : null;
}
```

- [ ] **Step 8: Run the domain tests**

Run: `pnpm vitest run src/domain`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/domain/line-amount.ts src/domain/line-amount.test.ts src/domain/promo.ts src/domain/promo.test.ts src/domain/purchase.ts
git commit -m "feat(domain): compute promotion discounts on a purchase line"
```

---

### Task 2: Net line amounts and promotion totals

**Files:**
- Modify: `src/domain/purchase.ts`
- Test: `src/domain/purchase.test.ts`

**Interfaces:**
- Consumes: `Promo`, `lineDiscount` (Task 1)
- Produces:
  - `type PurchaseLine = { productId: string; quantity: number; unitPriceCents: number; promo?: Promo | null }`
  - `type LineAmounts = Pick<PurchaseLine, "quantity" | "unitPriceCents" | "promo">` (exported)
  - `lineNet(line: LineAmounts): number`
  - `sumOfLines(lines: LineAmounts[]): number` — now the sum of **net** amounts
  - `sumOfDiscounts(lines: LineAmounts[]): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/purchase.test.ts` (and add `lineNet`, `sumOfDiscounts` to the import):

```ts
const twoPlusOne = { kind: "BUY_GET_FREE", buy: 2, free: 1 } as const;

describe("lineNet", () => {
  it("subtracts the promotion from the line amount", () => {
    expect(lineNet({ quantity: 3, unitPriceCents: 120, promo: twoPlusOne })).toBe(240);
  });

  it("is the line amount without a promotion", () => {
    expect(lineNet({ quantity: 1.2, unitPriceCents: 249 })).toBe(299);
  });
});

describe("sums with promotions", () => {
  const lines = [
    { quantity: 3, unitPriceCents: 120, promo: twoPlusOne },
    { quantity: 2, unitPriceCents: 99, promo: null },
    { quantity: 2, unitPriceCents: 120, promo: twoPlusOne }, // not reached
  ];

  it("sums net amounts", () => {
    expect(sumOfLines(lines)).toBe(240 + 198 + 240);
  });

  it("sums the discounts", () => {
    expect(sumOfDiscounts(lines)).toBe(120);
    expect(sumOfDiscounts([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/domain/purchase.test.ts`
Expected: FAIL, `lineNet` / `sumOfDiscounts` are not exported.

- [ ] **Step 3: Implement**

In `src/domain/purchase.ts`, replace the `PurchaseLine` type and `sumOfLines`:

```ts
import { multiplyByQuantity } from "./line-amount";
import { lineDiscount, type Promo } from "./promo";

export type PurchaseLine = { productId: string; quantity: number; unitPriceCents: number; promo?: Promo | null };
export type LineAmounts = Pick<PurchaseLine, "quantity" | "unitPriceCents" | "promo">;

// lineSubtotal unchanged (gross amount)

export function lineNet(line: LineAmounts): number {
  return lineSubtotal(line.quantity, line.unitPriceCents) - lineDiscount(line.quantity, line.unitPriceCents, line.promo);
}

export function sumOfLines(lines: LineAmounts[]): number {
  return lines.reduce((sum, line) => sum + lineNet(line), 0);
}

export function sumOfDiscounts(lines: LineAmounts[]): number {
  return lines.reduce((sum, line) => sum + lineDiscount(line.quantity, line.unitPriceCents, line.promo), 0);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/domain`
Expected: PASS (old `sumOfLines` tests unchanged: no promotion, same result).

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/domain/purchase.ts src/domain/purchase.test.ts
git commit -m "feat(domain): sum purchase lines after promotions"
```

---

### Task 3: Store promotions with each purchase line

**Files:**
- Modify: `prisma/schema.prisma` (enum `PromoKind`, `PurchaseItem` columns)
- Create: `prisma/migrations/<timestamp>_purchase_promotions/migration.sql` (generated, then the `CHECK` appended)
- Modify: `src/server/repositories/purchases.ts`
- Modify: `src/lib/purchase-draft.test.ts` (fixture gains `promo: null` so it still type-checks)
- Test: `src/server/repositories/purchases.test.ts`

**Interfaces:**
- Consumes: `Promo`, `PromoKind` (Task 1), `PurchaseLine.promo` (Task 2)
- Produces: `PurchaseItemDetail.promo: Promo | null`; `createPurchase` / `updatePurchase` persist `line.promo`.

- [ ] **Step 1: Write the failing integration tests**

Append inside `describe("purchase storage", …)` in `src/server/repositories/purchases.test.ts`:

```ts
  const promos: Promo[] = [
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 20 },
    { kind: "PERCENT_OFF", percent: 30 },
    { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 },
    { kind: "BUY_GET_FREE", buy: 2, free: 1 },
  ];

  it.each(promos)("keeps the promotion %j and the regular price", async (promo) => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 240,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 3, unitPriceCents: 120, promo }],
    });
    expect((await getPurchase(id))?.items[0]?.promo).toEqual(promo);
    expect((await db().priceObservation.findFirstOrThrow()).priceCents).toBe(120);
  });

  it("reads a line without a promotion as null", async () => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect((await getPurchase(id))?.items[0]?.promo).toBeNull();
  });

  it("replaces or removes promotions when a purchase is edited", async () => {
    const { lidl, penne, apples } = await setup();
    const base = { storeId: lidl.id, purchasedAt: day("2026-10-03"), totalCents: 240, receiptPath: null };
    const { id } = await createPurchase({
      ...base,
      lines: [
        { productId: penne.id, quantity: 3, unitPriceCents: 120, promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } },
        { productId: apples.id, quantity: 1, unitPriceCents: 249, promo: { kind: "PERCENT_OFF", percent: 30 } },
      ],
    });
    await updatePurchase(id, {
      ...base,
      lines: [
        { productId: penne.id, quantity: 3, unitPriceCents: 120, promo: { kind: "PERCENT_OFF", percent: 10 } },
        { productId: apples.id, quantity: 1, unitPriceCents: 249 },
      ],
    });
    const items = (await getPurchase(id))?.items ?? [];
    expect(items.map((item) => [item.product.name, item.promo])).toEqual([
      ["Penne", { kind: "PERCENT_OFF", percent: 10 }],
      ["Pommes", null],
    ]);
    expect((await listStorePrices(penne.id)).map((r) => r.priceCents)).toEqual([120]);
  });

  it.each([
    ["a kind without its parameter", { promoKind: "PERCENT_OFF" as const }],
    ["a parameter of another kind", { promoKind: "PERCENT_OFF" as const, promoPercent: 30, promoBuy: 2 }],
    ["a parameter without a kind", { promoPercent: 30 }],
    ["an out-of-range value", { promoKind: "NTH_PERCENT_OFF" as const, promoNth: 1, promoPercent: 60 }],
  ])("refuses %s in the database", async (_, columns) => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    const item = await db().purchaseItem.findFirstOrThrow({ where: { purchaseId: id } });
    await expect(db().purchaseItem.update({ where: { id: item.id }, data: columns })).rejects.toThrow();
  });
```

Add `import type { Promo } from "@/domain/promo";` at the top.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project integration src/server/repositories/purchases.test.ts`
Expected: FAIL — TypeScript/Prisma reject the unknown `promo*` fields, and `promo` is `undefined` on read.

- [ ] **Step 3: Add the columns to the Prisma schema**

In `prisma/schema.prisma`, after `enum PriceSource`:

```prisma
enum PromoKind {
  AMOUNT_OFF_PER_UNIT
  PERCENT_OFF
  NTH_PERCENT_OFF
  BUY_GET_FREE
}
```

In `model PurchaseItem`, after `unitPriceCents`:

```prisma
  /// One promotion per line; a CHECK constraint ties the parameters to the kind.
  promoKind        PromoKind?        @map("promo_kind")
  promoAmountCents Int?              @map("promo_amount_cents")
  promoPercent     Int?              @map("promo_percent")
  promoNth         Int?              @map("promo_nth")
  promoBuy         Int?              @map("promo_buy")
  promoFree        Int?              @map("promo_free")
```

- [ ] **Step 4: Generate the migration, then append the CHECK constraint**

Start the dev database if needed (`docker compose -f docker-compose.dev.yml --env-file .env up -d db`), then:

Run: `pnpm prisma migrate dev --create-only --name purchase_promotions`

Append to the generated `prisma/migrations/<timestamp>_purchase_promotions/migration.sql`:

```sql
-- Each kind has exactly its own parameters, in range. COALESCE: a NULL comparison must fail, not pass.
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_promo_check" CHECK (COALESCE(
  ("promo_kind" IS NULL
    AND num_nonnulls("promo_amount_cents", "promo_percent", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'AMOUNT_OFF_PER_UNIT'
    AND "promo_amount_cents" > 0
    AND num_nonnulls("promo_percent", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'PERCENT_OFF'
    AND "promo_percent" BETWEEN 1 AND 100
    AND num_nonnulls("promo_amount_cents", "promo_nth", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'NTH_PERCENT_OFF'
    AND "promo_nth" BETWEEN 2 AND 10
    AND "promo_percent" BETWEEN 1 AND 100
    AND num_nonnulls("promo_amount_cents", "promo_buy", "promo_free") = 0)
  OR ("promo_kind" = 'BUY_GET_FREE'
    AND "promo_buy" BETWEEN 1 AND 20
    AND "promo_free" BETWEEN 1 AND 20
    AND num_nonnulls("promo_amount_cents", "promo_percent", "promo_nth") = 0),
  FALSE
));
```

Run: `pnpm prisma migrate dev` (applies it and regenerates the client). Check that `prisma migrate dev` reports no drift afterwards (run it a second time: "Already in sync").

- [ ] **Step 5: Map promotions in the repository**

In `src/server/repositories/purchases.ts`:

```ts
import type { Promo, PromoKind } from "@/domain/promo";

// PurchaseItemDetail gains:
//   promo: Promo | null;

type PromoColumns = {
  promoKind: PromoKind | null;
  promoAmountCents: number | null;
  promoPercent: number | null;
  promoNth: number | null;
  promoBuy: number | null;
  promoFree: number | null;
};

const NO_PROMO: PromoColumns = {
  promoKind: null,
  promoAmountCents: null,
  promoPercent: null,
  promoNth: null,
  promoBuy: null,
  promoFree: null,
};

function promoColumns(promo: Promo | null | undefined): PromoColumns {
  if (!promo) return NO_PROMO;
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { ...NO_PROMO, promoKind: promo.kind, promoAmountCents: promo.amountCents };
    case "PERCENT_OFF":
      return { ...NO_PROMO, promoKind: promo.kind, promoPercent: promo.percent };
    case "NTH_PERCENT_OFF":
      return { ...NO_PROMO, promoKind: promo.kind, promoNth: promo.nth, promoPercent: promo.percent };
    case "BUY_GET_FREE":
      return { ...NO_PROMO, promoKind: promo.kind, promoBuy: promo.buy, promoFree: promo.free };
  }
}

/** The CHECK constraint guarantees the parameters of the stored kind are set. */
function required(value: number | null): number {
  if (value === null) throw new Error("Inconsistent promotion columns");
  return value;
}

function promoFromColumns(row: PromoColumns): Promo | null {
  switch (row.promoKind) {
    case null:
      return null;
    case "AMOUNT_OFF_PER_UNIT":
      return { kind: row.promoKind, amountCents: required(row.promoAmountCents) };
    case "PERCENT_OFF":
      return { kind: row.promoKind, percent: required(row.promoPercent) };
    case "NTH_PERCENT_OFF":
      return { kind: row.promoKind, nth: required(row.promoNth), percent: required(row.promoPercent) };
    case "BUY_GET_FREE":
      return { kind: row.promoKind, buy: required(row.promoBuy), free: required(row.promoFree) };
  }
}
```

In `itemsCreate`, spread the columns into each created item:

```ts
      unitPriceCents: line.unitPriceCents,
      ...promoColumns(line.promo),
```

In `getPurchase`, select the columns and map them:

```ts
const itemSelect = {
  id: true,
  quantity: true,
  unitPriceCents: true,
  promoKind: true,
  promoAmountCents: true,
  promoPercent: true,
  promoNth: true,
  promoBuy: true,
  promoFree: true,
  product: { select: { id: true, name: true, brand: true, photoPath: true, sizeValue: true, sizeUnit: true } },
} as const satisfies Prisma.PurchaseItemSelect;

type ItemRow = Prisma.PurchaseItemGetPayload<{ select: typeof itemSelect }>;

function toItemDetail({ id, quantity, unitPriceCents, product, ...columns }: ItemRow): PurchaseItemDetail {
  return { id, quantity: quantity.toNumber(), unitPriceCents, product, promo: promoFromColumns(columns) };
}
```

and in the query: `items: { select: itemSelect, orderBy: { id: "asc" } }`, returning `{ ...row, items: row.items.map(toItemDetail) }`.

In `src/lib/purchase-draft.test.ts`, add `promo: null,` to the item of the `purchaseToDraft` fixture (after `unitPriceCents: 249,`).

- [ ] **Step 6: Run the integration tests**

Run: `pnpm vitest run --project integration`
Expected: PASS, including the four "refuses … in the database" cases.

- [ ] **Step 7: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add prisma/schema.prisma prisma/migrations src/server/repositories/purchases.ts src/server/repositories/purchases.test.ts src/lib/purchase-draft.test.ts
git commit -m "feat(purchases): store a promotion on each purchase line"
```

---

### Task 4: Validate promotions in the purchase Server Actions

**Files:**
- Modify: `src/server/actions/purchases.schema.ts`
- Test: `src/server/actions/purchases.test.ts`

**Interfaces:**
- Consumes: `PROMO_LIMITS` (Task 1); repository persists `line.promo` (Task 3)
- Produces: each item of the `lines` JSON accepts an optional `promo` object:
  `{ kind: "AMOUNT_OFF_PER_UNIT", amountCents }` | `{ kind: "PERCENT_OFF", percent }` | `{ kind: "NTH_PERCENT_OFF", nth, percent }` | `{ kind: "BUY_GET_FREE", buy, free }`. Errors land in `errors.lines`.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/actions/purchases.test.ts`:

```ts
describe("promotions", () => {
  async function withPromo(promo: unknown, unitPriceCents = 120) {
    const { fields, penne } = await setup();
    return createPurchaseAction(
      null,
      form({ ...fields, total: "2,40", lines: JSON.stringify([{ productId: penne.id, quantity: 3, unitPriceCents, promo }]) }),
    );
  }

  it("records a line's promotion", async () => {
    const result = await withPromo({ kind: "BUY_GET_FREE", buy: 2, free: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await getPurchase(result.data.id))?.items[0]?.promo).toEqual({ kind: "BUY_GET_FREE", buy: 2, free: 1 });
  });

  it.each([
    [{ kind: "PERCENT_OFF", percent: 0 }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "PERCENT_OFF", percent: 101 }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "PERCENT_OFF", percent: null }, "Indique un pourcentage entre 1 et 100."],
    [{ kind: "NTH_PERCENT_OFF", nth: 1, percent: 60 }, "Indique un rang entre 2 et 10."],
    [{ kind: "BUY_GET_FREE", buy: 0, free: 1 }, "Indique un nombre d’articles entre 1 et 20."],
    [{ kind: "BUY_GET_FREE", buy: 2, free: null }, "Indique un nombre d’articles entre 1 et 20."],
    [{ kind: "AMOUNT_OFF_PER_UNIT", amountCents: null }, "Indique la remise par article, par exemple 0,50."],
    [{ kind: "AMOUNT_OFF_PER_UNIT", amountCents: 121 }, "La remise dépasse le prix de l’article."],
    [{ kind: "BOGO" }, "Vérifie la quantité et le prix de chaque article."],
    [{ kind: "PERCENT_OFF", percent: 30, buy: 2 }, "Vérifie la quantité et le prix de chaque article."],
  ])("refuses %j", async (promo, message) => {
    const result = await withPromo(promo);
    expect(result).toMatchObject({ ok: false, errors: { lines: [message] } });
    expect(await db().purchase.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project integration src/server/actions/purchases.test.ts`
Expected: FAIL — the promotion is stripped (read back as `null`) and invalid promotions are accepted.

- [ ] **Step 3: Implement the schema**

In `src/server/actions/purchases.schema.ts`:

```ts
import { PROMO_LIMITS } from "@/domain/promo";

const PERCENT_ERROR = "Indique un pourcentage entre 1 et 100.";
const NTH_ERROR = "Indique un rang entre 2 et 10.";
const ITEMS_ERROR = "Indique un nombre d’articles entre 1 et 20.";
const AMOUNT_ERROR = "Indique la remise par article, par exemple 0,50.";
const AMOUNT_TOO_HIGH = "La remise dépasse le prix de l’article.";

function wholeNumber(range: { min: number; max: number }, message: string) {
  return z.number({ error: message }).int(message).min(range.min, message).max(range.max, message);
}

const promoSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject(
      { kind: z.literal("AMOUNT_OFF_PER_UNIT"), amountCents: z.number({ error: AMOUNT_ERROR }).int(AMOUNT_ERROR).positive(AMOUNT_ERROR) },
      { error: LINES_ERROR },
    ),
    z.strictObject({ kind: z.literal("PERCENT_OFF"), percent: wholeNumber(PROMO_LIMITS.percent, PERCENT_ERROR) }, { error: LINES_ERROR }),
    z.strictObject(
      {
        kind: z.literal("NTH_PERCENT_OFF"),
        nth: wholeNumber(PROMO_LIMITS.nth, NTH_ERROR),
        percent: wholeNumber(PROMO_LIMITS.percent, PERCENT_ERROR),
      },
      { error: LINES_ERROR },
    ),
    z.strictObject(
      {
        kind: z.literal("BUY_GET_FREE"),
        buy: wholeNumber(PROMO_LIMITS.items, ITEMS_ERROR),
        free: wholeNumber(PROMO_LIMITS.items, ITEMS_ERROR),
      },
      { error: LINES_ERROR },
    ),
  ],
  { error: LINES_ERROR },
);
```

Extend `lineSchema` with `promo: promoSchema.optional()` and the per-item cap:

```ts
const lineSchema = z
  .object({
    productId: /* unchanged */,
    quantity: /* unchanged */,
    unitPriceCents: /* unchanged */,
    promo: promoSchema.optional(),
  })
  .refine(
    (line) => line.promo?.kind !== "AMOUNT_OFF_PER_UNIT" || line.promo.amountCents <= line.unitPriceCents,
    AMOUNT_TOO_HIGH,
  );
```

If Zod 4 reports the unrecognized key (`buy` on `PERCENT_OFF`) with its default message instead of `LINES_ERROR`, keep `z.strictObject` and pass the message through the `error` callback form: `{ error: () => LINES_ERROR }`. Check with the test, do not loosen the expectation.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project integration src/server/actions/purchases.test.ts`
Expected: PASS (all earlier cases still pass: `promo` is optional).

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/server/actions/purchases.schema.ts src/server/actions/purchases.test.ts
git commit -m "feat(purchases): validate line promotions when saving a purchase"
```

---

### Task 5: Promotions in the purchase draft and promotion labels

**Files:**
- Modify: `src/lib/purchase-draft.ts`, `src/lib/purchase-draft.test.ts`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `Promo`, `PROMO_KINDS`, `PromoKind`, `isPromoValid`, `parsePromoNumber` (Task 1); `LineAmounts` (Task 2); `PurchaseItemDetail.promo` (Task 3)
- Produces (`purchase-draft.ts`):
  - `type DraftPromo = { kind: PromoKind; amount: string; percent: string; nth: string; buy: string; free: string }`
  - `DraftLine` gains `promo?: DraftPromo`
  - `emptyDraftPromo(): DraftPromo` — kind `AMOUNT_OFF_PER_UNIT`, `nth: "2"`, others `""`
  - `readDraftPromo(promo: DraftPromo, unitPriceCents: number): Promo | null` — null while a value is missing or out of range
  - `promoToDraft(promo: Promo): DraftPromo`
  - `draftLinePayload(line: DraftLine)` → `{ productId, quantity: number | null, unitPriceCents: number | null, promo?: Record<string, string | number | null> }`
  - `draftLineAmounts(line: DraftLine): LineAmounts | null` — null while quantity or price is unreadable; `promo` is the valid promotion or `null`
- Produces (`format.ts`): `formatPromo(promo: Promo): string`, `formatDiscount(cents: number): string`

- [ ] **Step 1: Write the failing label tests**

Append to `src/lib/format.test.ts` (add `formatDiscount`, `formatPromo` to the import):

```ts
describe("formatPromo", () => {
  it.each([
    [{ kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 }, /^−0,50\s€ par article$/],
    [{ kind: "PERCENT_OFF", percent: 30 }, /^−30\s%$/],
    [{ kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 }, /^Le 2e à −60\s%$/],
    [{ kind: "BUY_GET_FREE", buy: 2, free: 1 }, /^2 achetés = 1 offert$/],
    [{ kind: "BUY_GET_FREE", buy: 1, free: 2 }, /^1 acheté = 2 offerts$/],
  ] as const)("writes %j", (promo, expected) => {
    expect(formatPromo(promo)).toMatch(expected);
  });
});

describe("formatDiscount", () => {
  it("writes a discount with a minus sign", () => {
    expect(formatDiscount(120)).toMatch(/^−1,20\s€$/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib/format.test.ts`
Expected: FAIL, `formatPromo` is not exported.

- [ ] **Step 3: Implement the labels**

In `src/lib/format.ts`:

```ts
import type { Promo } from "@/domain/promo";

const NBSP = " ";

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
```

Run: `pnpm vitest run src/lib/format.test.ts` — Expected: PASS.

- [ ] **Step 4: Write the failing draft tests**

Append to `src/lib/purchase-draft.test.ts` (extend the import with `draftLineAmounts`, `draftLinePayload`, `type DraftPromo`, `emptyDraftPromo`, `promoToDraft`, `readDraftPromo`; add `import type { Promo } from "@/domain/promo";`):

```ts
const twoPlusOne: DraftPromo = { ...emptyDraftPromo(), kind: "BUY_GET_FREE", buy: "2", free: "1" };

describe("draft promotions", () => {
  it("round-trips a line with a half-typed promotion", () => {
    const withPromo: PurchaseDraft = { ...draft, lines: [{ ...draft.lines[0]!, promo: { ...twoPlusOne, free: "" } }] };
    expect(parseDraft(serializeDraft(withPromo), known)).toEqual(withPromo);
  });

  it("restores a draft saved before promotions existed", () => {
    expect(parseDraft(serializeDraft(draft), known)?.lines[0]?.promo).toBeUndefined();
  });

  it.each<Promo>([
    { kind: "AMOUNT_OFF_PER_UNIT", amountCents: 50 },
    { kind: "PERCENT_OFF", percent: 30 },
    { kind: "NTH_PERCENT_OFF", nth: 2, percent: 60 },
    { kind: "BUY_GET_FREE", buy: 2, free: 1 },
  ])("reads back %j from its typed values", (promo) => {
    expect(readDraftPromo(promoToDraft(promo), 120)).toEqual(promo);
  });

  it.each<[string, DraftPromo]>([
    ["a missing value", { ...twoPlusOne, free: "" }],
    ["an unreadable value", { ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "abc" }],
    ["an out-of-range value", { ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "150" }],
    ["a discount above the price", { ...emptyDraftPromo(), amount: "1,50" }],
  ])("gives no promotion while there is %s", (_, promo) => {
    expect(readDraftPromo(promo, 120)).toBeNull();
  });

  it("sends the typed numbers, null when unreadable, so the server can explain", () => {
    expect(draftLinePayload({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20", promo: { ...twoPlusOne, free: "x" } })).toEqual({
      productId: "penne",
      quantity: 3,
      unitPriceCents: 120,
      promo: { kind: "BUY_GET_FREE", buy: 2, free: null },
    });
    expect(draftLinePayload({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20" })).toEqual({
      productId: "penne",
      quantity: 3,
      unitPriceCents: 120,
    });
  });

  it("computes a line only once quantity and price are readable", () => {
    expect(draftLineAmounts({ key: "a", productId: "penne", quantity: "3", unitPrice: "1,20", promo: twoPlusOne })).toEqual({
      quantity: 3,
      unitPriceCents: 120,
      promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 },
    });
    expect(draftLineAmounts({ key: "a", productId: "penne", quantity: "3", unitPrice: "" })).toBeNull();
  });

  it("turns a saved promotion into editable values", () => {
    const purchase = {
      id: "p1",
      purchasedAt: new Date("2026-10-03T00:00:00.000Z"),
      totalCents: 240,
      receiptPath: null,
      store: { id: "lidl", name: "Lidl", address: null, logoPath: null },
      items: [
        {
          id: "i1",
          quantity: 3,
          unitPriceCents: 120,
          promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } as const,
          product: { id: "penne", name: "Penne", brand: null, photoPath: null, sizeValue: 500, sizeUnit: "G" as const },
        },
      ],
    };
    expect(purchaseToDraft(purchase).lines[0]?.promo).toEqual(twoPlusOne);
  });
});
```

- [ ] **Step 5: Run them and watch them fail**

Run: `pnpm vitest run src/lib/purchase-draft.test.ts`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 6: Implement the draft promotion**

In `src/lib/purchase-draft.ts`:

```ts
import { formatEurosInput, parseEuros } from "@/domain/money";
import { isPromoValid, parsePromoNumber, type Promo, PROMO_KINDS } from "@/domain/promo";
import { formatQuantity, type LineAmounts, parseQuantity } from "@/domain/purchase";

const draftPromoSchema = z.object({
  kind: z.enum(PROMO_KINDS),
  amount: z.string(),
  percent: z.string(),
  nth: z.string(),
  buy: z.string(),
  free: z.string(),
});

const draftLineSchema = z.object({
  key: z.string(),
  productId: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  promo: draftPromoSchema.optional(),
});

export type DraftPromo = z.infer<typeof draftPromoSchema>;

export function emptyDraftPromo(): DraftPromo {
  return { kind: "AMOUNT_OFF_PER_UNIT", amount: "", percent: "", nth: "2", buy: "", free: "" };
}

/** What the form sends: typed numbers, null when unreadable, so the server says what is wrong. */
function promoPayload(promo: DraftPromo): Record<string, string | number | null> {
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { kind: promo.kind, amountCents: parseEuros(promo.amount) };
    case "PERCENT_OFF":
      return { kind: promo.kind, percent: parsePromoNumber(promo.percent) };
    case "NTH_PERCENT_OFF":
      return { kind: promo.kind, nth: parsePromoNumber(promo.nth), percent: parsePromoNumber(promo.percent) };
    case "BUY_GET_FREE":
      return { kind: promo.kind, buy: parsePromoNumber(promo.buy), free: parsePromoNumber(promo.free) };
  }
}

function toPromo(promo: DraftPromo): Promo | null {
  const percent = parsePromoNumber(promo.percent);
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT": {
      const amountCents = parseEuros(promo.amount);
      return amountCents === null ? null : { kind: promo.kind, amountCents };
    }
    case "PERCENT_OFF":
      return percent === null ? null : { kind: promo.kind, percent };
    case "NTH_PERCENT_OFF": {
      const nth = parsePromoNumber(promo.nth);
      return nth === null || percent === null ? null : { kind: promo.kind, nth, percent };
    }
    case "BUY_GET_FREE": {
      const buy = parsePromoNumber(promo.buy);
      const free = parsePromoNumber(promo.free);
      return buy === null || free === null ? null : { kind: promo.kind, buy, free };
    }
  }
}

/** The promotion to compute with, or null while a value is missing or out of range. */
export function readDraftPromo(promo: DraftPromo, unitPriceCents: number): Promo | null {
  const candidate = toPromo(promo);
  return candidate && isPromoValid(candidate, unitPriceCents) ? candidate : null;
}

export function promoToDraft(promo: Promo): DraftPromo {
  const draft = { ...emptyDraftPromo(), kind: promo.kind };
  switch (promo.kind) {
    case "AMOUNT_OFF_PER_UNIT":
      return { ...draft, amount: formatEurosInput(promo.amountCents) };
    case "PERCENT_OFF":
      return { ...draft, percent: String(promo.percent) };
    case "NTH_PERCENT_OFF":
      return { ...draft, nth: String(promo.nth), percent: String(promo.percent) };
    case "BUY_GET_FREE":
      return { ...draft, buy: String(promo.buy), free: String(promo.free) };
  }
}

export function draftLinePayload(line: DraftLine) {
  return {
    productId: line.productId,
    quantity: parseQuantity(line.quantity),
    unitPriceCents: parseEuros(line.unitPrice),
    ...(line.promo && { promo: promoPayload(line.promo) }),
  };
}

export function draftLineAmounts(line: DraftLine): LineAmounts | null {
  const quantity = parseQuantity(line.quantity);
  const unitPriceCents = parseEuros(line.unitPrice);
  if (quantity === null || unitPriceCents === null) return null;
  return { quantity, unitPriceCents, promo: line.promo ? readDraftPromo(line.promo, unitPriceCents) : null };
}
```

In `purchaseToDraft`, add the promotion to each line:

```ts
    lines: purchase.items.map((item) => ({
      key: item.id,
      productId: item.product.id,
      quantity: formatQuantity(item.quantity),
      unitPrice: formatEurosInput(item.unitPriceCents),
      ...(item.promo && { promo: promoToDraft(item.promo) }),
    })),
```

The storage key stays `cabas:purchase-draft:v1`: `promo` is optional, older drafts still parse.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/lib`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/lib/format.ts src/lib/format.test.ts src/lib/purchase-draft.ts src/lib/purchase-draft.test.ts
git commit -m "feat(purchases): keep line promotions in the purchase draft"
```

---

### Task 6: Promotion editor on a purchase line

**Files:**
- Create: `src/components/purchases/promo-status.tsx`
- Create: `src/components/purchases/promo-editor.tsx`, `src/components/purchases/promo-editor.test.tsx`
- Modify: `src/components/purchases/purchase-lines.tsx`

**Interfaces:**
- Consumes: `DraftPromo`, `emptyDraftPromo`, `readDraftPromo`, `draftLineAmounts` (Task 5); `formatPromo`, `formatDiscount` (Task 5); `lineDiscount`, `isPromoReached`, `promoMinimumQuantity`, `inRange`, `PROMO_LIMITS`, `parsePromoNumber` (Task 1)
- Produces:
  - `PromoStatus({ promo: Promo; quantity: number; unitPriceCents: number })` — a `<span>`, usable in Server Components (no `"use client"`)
  - `PromoEditor({ lineKey: string; productName: string; promo: DraftPromo | undefined; quantity: number | null; unitPriceCents: number | null; onChange: (promo: DraftPromo | undefined) => void })`
  - Accessible names used by later tests: button `Ajouter une promo sur {name}`; group `Type de promo pour {name}` with toggles `− € / article`, `− %`, `Le Ne à −%`, `Achetés / offerts`; fields `Remise par article pour {name}`, `Pourcentage de remise pour {name}`, `Rang de l’article remisé pour {name}`, `Articles achetés pour {name}`, `Articles offerts pour {name}`; buttons `Valider la promo sur {name}`, `Retirer la promo sur {name}`; the collapsed summary is a button whose name is the promotion text.

Behavior (spec §7: an explicit **OK** button collapses the editor, because Safari does not focus tapped buttons, so "collapse when focus leaves" is unreliable on iPhone):
- No promotion → a "+ Promo" button.
- Editing (just added, reopened from the summary, or invalid) → toggles, the fields of the selected kind, a live `role="status"` line, OK (disabled while invalid) and "Retirer la promo".
- Valid and not editing → the summary button; a click reopens the editor.

- [ ] **Step 1: Write the failing component tests**

`src/components/purchases/promo-editor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type DraftPromo, emptyDraftPromo } from "@/lib/purchase-draft";
import { PromoEditor } from "./promo-editor";

function Harness({ initial, quantity = 3 }: { initial?: DraftPromo; quantity?: number }) {
  const [promo, setPromo] = useState(initial);
  return <PromoEditor lineKey="a" productName="Penne" promo={promo} quantity={quantity} unitPriceCents={120} onChange={setPromo} />;
}

async function addTwoPlusOne() {
  await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
  await userEvent.click(screen.getByRole("button", { name: "Achetés / offerts" }));
  await userEvent.type(screen.getByLabelText("Articles achetés pour Penne"), "2");
  await userEvent.type(screen.getByLabelText("Articles offerts pour Penne"), "1");
}

describe("PromoEditor", () => {
  it("adds a promotion, shows its discount and folds it into a summary", async () => {
    render(<Harness />);
    await addTwoPlusOne();
    expect(screen.getByRole("status")).toHaveTextContent(/2 achetés = 1 offert · −1,20\s€/);
    await userEvent.click(screen.getByRole("button", { name: "Valider la promo sur Penne" }));
    expect(screen.queryByLabelText("Articles achetés pour Penne")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2 achetés = 1 offert · −1,20\s€/ })).toBeInTheDocument();
  });

  it("explains how many items the promotion needs", async () => {
    render(<Harness quantity={2} />);
    await addTwoPlusOne();
    expect(screen.getByRole("status")).toHaveTextContent("il faut 3 articles");
  });

  it("marks an out-of-range value and cannot be folded until fixed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
    await userEvent.click(screen.getByRole("button", { name: "− %" }));
    await userEvent.type(screen.getByLabelText("Pourcentage de remise pour Penne"), "150");
    expect(screen.getByLabelText("Pourcentage de remise pour Penne")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Valider la promo sur Penne" })).toBeDisabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("marks the selected kind as pressed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne" }));
    await userEvent.click(screen.getByRole("button", { name: "Le Ne à −%" }));
    expect(screen.getByRole("button", { name: "Le Ne à −%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Rang de l’article remisé pour Penne")).toHaveValue("2");
  });

  it("removes the promotion", async () => {
    render(<Harness />);
    await addTwoPlusOne();
    await userEvent.click(screen.getByRole("button", { name: "Retirer la promo sur Penne" }));
    expect(screen.getByRole("button", { name: "Ajouter une promo sur Penne" })).toBeInTheDocument();
  });

  it("reopens a saved promotion from its summary", async () => {
    render(<Harness initial={{ ...emptyDraftPromo(), kind: "PERCENT_OFF", percent: "30" }} />);
    await userEvent.click(screen.getByRole("button", { name: /−30\s%/ }));
    expect(screen.getByLabelText("Pourcentage de remise pour Penne")).toHaveValue("30");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/components/purchases/promo-editor.test.tsx`
Expected: FAIL, cannot resolve `./promo-editor`.

- [ ] **Step 3: Implement `PromoStatus`**

`src/components/purchases/promo-status.tsx`:

```tsx
import { Tag } from "lucide-react";
import { isPromoReached, lineDiscount, type Promo, promoMinimumQuantity } from "@/domain/promo";
import { formatDiscount, formatPromo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { promo: Promo; quantity: number; unitPriceCents: number };

export function PromoStatus({ promo, quantity, unitPriceCents }: Props) {
  const reached = isPromoReached(quantity, promo);
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-sm font-semibold",
        reached ? "text-savings" : "text-amber-700 dark:text-amber-400",
      )}
    >
      <Tag className="size-4 shrink-0" aria-hidden />
      <span>
        {formatPromo(promo)} ·{" "}
        {reached ? (
          <span className="font-mono">{formatDiscount(lineDiscount(quantity, unitPriceCents, promo))}</span>
        ) : (
          `il faut ${promoMinimumQuantity(promo)} articles`
        )}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Implement `PromoEditor`**

`src/components/purchases/promo-editor.tsx`:

```tsx
"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseEuros } from "@/domain/money";
import { inRange, parsePromoNumber, PROMO_LIMITS, type PromoKind } from "@/domain/promo";
import { type DraftPromo, emptyDraftPromo, readDraftPromo } from "@/lib/purchase-draft";
import { cn } from "@/lib/utils";
import { PromoStatus } from "./promo-status";

type Props = {
  lineKey: string;
  productName: string;
  promo: DraftPromo | undefined;
  quantity: number | null;
  unitPriceCents: number | null;
  onChange: (promo: DraftPromo | undefined) => void;
};

const KINDS: { kind: PromoKind; label: string }[] = [
  { kind: "AMOUNT_OFF_PER_UNIT", label: "− € / article" },
  { kind: "PERCENT_OFF", label: "− %" },
  { kind: "NTH_PERCENT_OFF", label: "Le Ne à −%" },
  { kind: "BUY_GET_FREE", label: "Achetés / offerts" },
];

function countInvalid(value: string, range: { min: number; max: number }): boolean {
  const parsed = parsePromoNumber(value);
  return value.trim() !== "" && (parsed === null || !inRange(parsed, range));
}

function amountInvalid(value: string, unitPriceCents: number | null): boolean {
  const parsed = parseEuros(value);
  return value.trim() !== "" && (parsed === null || (unitPriceCents !== null && parsed > unitPriceCents));
}

type PromoInputProps = {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  decimal?: boolean;
  onValue: (value: string) => void;
};

function PromoInput({ id, label, value, invalid, decimal = false, onValue }: PromoInputProps) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        inputMode={decimal ? "decimal" : "numeric"}
        className={cn("font-mono", decimal ? "w-20" : "w-16")}
        value={value}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => onValue(event.target.value)}
      />
    </>
  );
}

export function PromoEditor({ lineKey, productName, promo, quantity, unitPriceCents, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  if (!promo) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-11 justify-self-start px-2 text-primary"
        aria-label={`Ajouter une promo sur ${productName}`}
        onClick={() => {
          onChange(emptyDraftPromo());
          setEditing(true);
        }}
      >
        <Plus aria-hidden /> Promo
      </Button>
    );
  }

  const parsed = unitPriceCents === null ? null : readDraftPromo(promo, unitPriceCents);

  if (parsed && !editing && quantity !== null && unitPriceCents !== null) {
    return (
      <button type="button" className="min-h-11 justify-self-start text-left" onClick={() => setEditing(true)}>
        <PromoStatus promo={parsed} quantity={quantity} unitPriceCents={unitPriceCents} />
      </button>
    );
  }

  const set = (patch: Partial<DraftPromo>) => onChange({ ...promo, ...patch });
  const id = (name: string) => `promo-${name}-${lineKey}`;
  const percentInput = (
    <PromoInput
      id={id("percent")}
      label={`Pourcentage de remise pour ${productName}`}
      value={promo.percent}
      invalid={countInvalid(promo.percent, PROMO_LIMITS.percent)}
      onValue={(percent) => set({ percent })}
    />
  );

  return (
    <div className="grid gap-2 rounded-md border border-dashed p-2">
      <div role="group" aria-label={`Type de promo pour ${productName}`} className="flex flex-wrap gap-1.5">
        {KINDS.map(({ kind, label }) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={promo.kind === kind ? "default" : "outline"}
            className="h-11 rounded-full"
            aria-pressed={promo.kind === kind}
            onClick={() => set({ kind })}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {promo.kind === "AMOUNT_OFF_PER_UNIT" && (
          <>
            <PromoInput
              id={id("amount")}
              label={`Remise par article pour ${productName}`}
              value={promo.amount}
              invalid={amountInvalid(promo.amount, unitPriceCents)}
              decimal
              onValue={(amount) => set({ amount })}
            />
            <span>€ par article</span>
          </>
        )}
        {promo.kind === "PERCENT_OFF" && (
          <>
            <span>−</span>
            {percentInput}
            <span>%</span>
          </>
        )}
        {promo.kind === "NTH_PERCENT_OFF" && (
          <>
            <span>Le</span>
            <PromoInput
              id={id("nth")}
              label={`Rang de l’article remisé pour ${productName}`}
              value={promo.nth}
              invalid={countInvalid(promo.nth, PROMO_LIMITS.nth)}
              onValue={(nth) => set({ nth })}
            />
            <span>e à −</span>
            {percentInput}
            <span>%</span>
          </>
        )}
        {promo.kind === "BUY_GET_FREE" && (
          <>
            <PromoInput
              id={id("buy")}
              label={`Articles achetés pour ${productName}`}
              value={promo.buy}
              invalid={countInvalid(promo.buy, PROMO_LIMITS.items)}
              onValue={(buy) => set({ buy })}
            />
            <span>achetés =</span>
            <PromoInput
              id={id("free")}
              label={`Articles offerts pour ${productName}`}
              value={promo.free}
              invalid={countInvalid(promo.free, PROMO_LIMITS.items)}
              onValue={(free) => set({ free })}
            />
            <span>offerts</span>
          </>
        )}
      </div>
      <div role="status">
        {parsed && quantity !== null && unitPriceCents !== null && (
          <PromoStatus promo={parsed} quantity={quantity} unitPriceCents={unitPriceCents} />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-11"
          disabled={!parsed}
          aria-label={`Valider la promo sur ${productName}`}
          onClick={() => setEditing(false)}
        >
          OK
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-11"
          aria-label={`Retirer la promo sur ${productName}`}
          onClick={() => {
            onChange(undefined);
            setEditing(false);
          }}
        >
          <X aria-hidden /> Retirer la promo
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the component tests**

Run: `pnpm vitest run src/components/purchases/promo-editor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Put the editor under each purchase line**

In `src/components/purchases/purchase-lines.tsx`:

```tsx
import { draftLineAmounts, type DraftLine } from "@/lib/purchase-draft";
import { lineDiscount } from "@/domain/promo";
import { lineSubtotal } from "@/domain/purchase";
import { PromoEditor } from "./promo-editor";

// inside the map, replace the quantity/price parsing used for the amount:
const amounts = draftLineAmounts(line);
const gross = amounts && lineSubtotal(amounts.quantity, amounts.unitPriceCents);
const discount = amounts ? lineDiscount(amounts.quantity, amounts.unitPriceCents, amounts.promo) : 0;
const quantity = parseQuantity(line.quantity);
const price = parseEuros(line.unitPrice);

// the amount on the right:
<p className="ml-auto font-mono font-bold">
  {gross === null ? (
    "—"
  ) : discount > 0 ? (
    <>
      <s className="mr-1.5 font-normal text-muted-foreground">{formatEuros(gross)}</s>
      {formatEuros(gross - discount)}
    </>
  ) : (
    formatEuros(gross)
  )}
</p>

// after the controls row, still inside <li>:
<PromoEditor
  lineKey={line.key}
  productName={name}
  promo={line.promo}
  quantity={quantity}
  unitPriceCents={price}
  onChange={(promo) => onChange(line.key, { promo })}
/>
```

Keep `aria-invalid` on the price input using `price` as today.

- [ ] **Step 7: Run all component tests**

Run: `pnpm vitest run --project components`
Expected: PASS (the purchase form tests still pass: no promotion, same amounts).

- [ ] **Step 8: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/purchases/promo-status.tsx src/components/purchases/promo-editor.tsx src/components/purchases/promo-editor.test.tsx src/components/purchases/purchase-lines.tsx
git commit -m "feat(purchases): add a promotion editor to each purchase line"
```

---

### Task 7: Totals after promotions in the form and the purchase detail

**Files:**
- Create: `src/components/purchases/lines-summary.tsx`, `src/components/purchases/lines-summary.test.tsx`
- Modify: `src/components/purchases/purchase-form.tsx`, `src/components/purchases/purchase-form.test.tsx`
- Modify: `src/app/(app)/purchases/[id]/page.tsx`

**Interfaces:**
- Consumes: `sumOfLines`, `sumOfDiscounts`, `lineNet`, `LineAmounts` (Task 2); `lineDiscount` (Task 1); `formatDiscount` (Task 5); `draftLinePayload`, `draftLineAmounts` (Task 5); `PromoStatus` (Task 6); `PurchaseItemDetail.promo` (Task 3)
- Produces: `LinesSummary({ lines: LineAmounts[] })` — `<dt>/<dd>` rows to place inside a `<dl>`

- [ ] **Step 1: Write the failing summary tests**

`src/components/purchases/lines-summary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinesSummary } from "./lines-summary";

const twoPlusOne = { kind: "BUY_GET_FREE", buy: 2, free: 1 } as const;

function renderRows(lines: Parameters<typeof LinesSummary>[0]["lines"]) {
  render(
    <dl>
      <LinesSummary lines={lines} />
    </dl>,
  );
}

describe("LinesSummary", () => {
  it("shows only the sum when no line has a discount", () => {
    renderRows([{ quantity: 2, unitPriceCents: 120, promo: twoPlusOne }]); // not reached
    expect(screen.queryByText("Avant promos")).not.toBeInTheDocument();
    expect(screen.getByText("Somme des articles").nextElementSibling).toHaveTextContent(/2,40\s€/);
  });

  it("shows the amount before promotions and what they saved", () => {
    renderRows([
      { quantity: 3, unitPriceCents: 120, promo: twoPlusOne },
      { quantity: 1, unitPriceCents: 200, promo: { kind: "PERCENT_OFF", percent: 50 } },
      { quantity: 1, unitPriceCents: 99 },
    ]);
    expect(screen.getByText("Avant promos").nextElementSibling).toHaveTextContent(/6,59\s€/);
    expect(screen.getByText("Promos (2 articles)").nextElementSibling).toHaveTextContent(/−2,20\s€/);
    expect(screen.getByText("Somme des articles").nextElementSibling).toHaveTextContent(/4,39\s€/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/components/purchases/lines-summary.test.tsx`
Expected: FAIL, cannot resolve `./lines-summary`.

- [ ] **Step 3: Implement `LinesSummary`**

`src/components/purchases/lines-summary.tsx`:

```tsx
import { formatEuros } from "@/domain/money";
import { lineDiscount } from "@/domain/promo";
import { type LineAmounts, sumOfDiscounts, sumOfLines } from "@/domain/purchase";
import { formatDiscount } from "@/lib/format";

/** Rows shared by the purchase form and detail; place inside a <dl>. */
export function LinesSummary({ lines }: { lines: LineAmounts[] }) {
  const sum = sumOfLines(lines);
  const discounts = sumOfDiscounts(lines);
  const discounted = lines.filter((line) => lineDiscount(line.quantity, line.unitPriceCents, line.promo) > 0).length;
  return (
    <>
      {discounts > 0 && (
        <>
          <div className="flex justify-between text-muted-foreground">
            <dt>Avant promos</dt>
            <dd className="font-mono">{formatEuros(sum + discounts)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-savings">
            <dt>{`Promos (${discounted} ${discounted > 1 ? "articles" : "article"})`}</dt>
            <dd className="font-mono">{formatDiscount(discounts)}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between text-muted-foreground">
        <dt>Somme des articles</dt>
        <dd className="font-mono">{formatEuros(sum)}</dd>
      </div>
    </>
  );
}
```

Run: `pnpm vitest run src/components/purchases/lines-summary.test.tsx` — Expected: PASS.

- [ ] **Step 4: Write the failing form tests**

Append inside `describe("PurchaseForm", …)` in `src/components/purchases/purchase-form.test.tsx`:

```tsx
  async function addTwoPlusOne() {
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une promo sur Penne Rigate" }));
    await userEvent.click(screen.getByRole("button", { name: "Achetés / offerts" }));
    await userEvent.type(screen.getByLabelText("Articles achetés pour Penne Rigate"), "2");
    await userEvent.type(screen.getByLabelText("Articles offerts pour Penne Rigate"), "1");
  }

  it("prefills the total after promotions and sends the promotion", async () => {
    const props = renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    await addTwoPlusOne();
    expect(screen.getByLabelText("Total payé")).toHaveValue("1,98");
    expect(screen.getByText("Promos (1 article)").nextElementSibling).toHaveTextContent(/−0,99\s€/);

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la course" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/purchases/p1"));
    const sent = (props.action as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(sent.get("lines") as string)).toEqual([
      { productId: "penne", quantity: 3, unitPriceCents: 99, promo: { kind: "BUY_GET_FREE", buy: 2, free: 1 } },
    ]);
  });

  it("restores a draft line with its promotion", async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      serializeDraft({
        storeId: "lidl",
        purchasedAt: "2026-10-02",
        lines: [
          {
            key: "a",
            productId: "penne",
            quantity: "3",
            unitPrice: "0,99",
            promo: { kind: "BUY_GET_FREE", amount: "", percent: "", nth: "2", buy: "2", free: "1" },
          },
        ],
        total: "",
        totalEdited: false,
      }),
    );
    renderForm();
    expect(await screen.findByRole("button", { name: /2 achetés = 1 offert · −0,99\s€/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Total payé")).toHaveValue("1,98");
  });
```

- [ ] **Step 5: Run them and watch them fail**

Run: `pnpm vitest run src/components/purchases/purchase-form.test.tsx`
Expected: FAIL — the total is still the gross 2,97 and no promotion is sent.

- [ ] **Step 6: Use net amounts and the payload in the form**

In `src/components/purchases/purchase-form.tsx`, replace the `lines` / `sum` computation:

```tsx
import { draftLineAmounts, draftLinePayload /* , …existing imports */ } from "@/lib/purchase-draft";
import { LinesSummary } from "./lines-summary";

  const amounts = draft.lines.flatMap((line) => draftLineAmounts(line) ?? []);
  const sum = sumOfLines(amounts);
  const total = draft.totalEdited ? draft.total : sum > 0 ? formatEurosInput(sum) : "";
```

the hidden input:

```tsx
<input type="hidden" name="lines" value={JSON.stringify(draft.lines.map(draftLinePayload))} />
```

and the summary card's first row:

```tsx
<dl className="grid gap-1 text-sm">
  <LinesSummary lines={amounts} />
</dl>
```

Remove the now-unused imports (`parseEuros`, `type PurchaseLine`, and `parseQuantity` if no longer used — `addProduct` still uses `parseQuantity`).

- [ ] **Step 7: Run the form tests**

Run: `pnpm vitest run --project components`
Expected: PASS, including the existing "sends the lines" test (no promotion → no `promo` key).

- [ ] **Step 8: Show promotions on the purchase detail**

In `src/app/(app)/purchases/[id]/page.tsx`:

```tsx
import { lineNet, sumOfLines, formatQuantity } from "@/domain/purchase";
import { LinesSummary } from "@/components/purchases/lines-summary";
import { PromoStatus } from "@/components/purchases/promo-status";

// in each <li>, under the "quantity × price · size" line:
{item.promo && <PromoStatus promo={item.promo} quantity={item.quantity} unitPriceCents={item.unitPriceCents} />}

// the amount on the right:
<span className="font-mono font-bold">{formatEuros(lineNet(item))}</span>

// the summary <dl>:
<dl className="grid gap-1 rounded-md border bg-card p-3 text-sm">
  <LinesSummary lines={purchase.items} />
  {gap !== 0 && (
    <div className="flex justify-between text-muted-foreground">
      <dt>Écart (oublis, arrondis)</dt>
      <dd className="font-mono">{formatEuros(gap)}</dd>
    </div>
  )}
  <div className="flex justify-between text-base font-bold">
    <dt>Total payé</dt>
    <dd className="font-mono">{formatEuros(purchase.totalCents)}</dd>
  </div>
</dl>
```

`sum` stays `sumOfLines(purchase.items)` (now net) and `gap = purchase.totalCents - sum`. Drop the `lineSubtotal` import if unused. This page is an async Server Component: it is covered by the Playwright flow in Task 8.

- [ ] **Step 9: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/purchases/lines-summary.tsx src/components/purchases/lines-summary.test.tsx src/components/purchases/purchase-form.tsx src/components/purchases/purchase-form.test.tsx "src/app/(app)/purchases/[id]/page.tsx"
git commit -m "feat(purchases): total purchases after promotions in the form and detail"
```

---

### Task 8: End-to-end flow and documentation

**Files:**
- Modify: `tests/e2e/purchase.spec.ts`
- Modify: `docs/superpowers/plans/2026-10-03-cabas-roadmap.md` (mark this work in the roadmap)

**Interfaces:**
- Consumes: the accessible names produced in Task 6.

- [ ] **Step 1: Extend the purchase flow with a promotion**

In `tests/e2e/purchase.spec.ts`, replace the block from `await page.getByRole("button", { name: "Augmenter" }).click();` to the draft-reload assertions with:

```ts
  await page.getByRole("button", { name: "Augmenter" }).click();
  await page.getByRole("button", { name: "Augmenter" }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("4,47");

  // "2 achetés = 1 offert" on 3 items: one is free, the store price stays 1,49.
  await page.getByRole("button", { name: `Ajouter une promo sur ${product}` }).click();
  await page.getByRole("button", { name: "Achetés / offerts" }).click();
  await page.getByLabel(`Articles achetés pour ${product}`).fill("2");
  await page.getByLabel(`Articles offerts pour ${product}`).fill("1");
  await page.getByRole("button", { name: `Valider la promo sur ${product}` }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("2,98");

  // The draft survives a reload (phone call, accidental refresh), promotion included.
  await page.reload();
  await expect(page.getByLabel(`Quantité de ${product}`)).toHaveValue("3");
  await expect(page.getByRole("button", { name: /2 achetés = 1 offert/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);
```

After the detail-page heading assertion, add:

```ts
  await expect(page.getByText(/2 achetés = 1 offert/)).toBeVisible();
  await expect(page.getByText("Promos (1 article)")).toBeVisible();
```

The existing assertions (`2,98 €` on the detail, `1,49` in the product's price table, and the price gone after deleting the purchase) stay as they are: they now prove the total is net and the observation regular.

- [ ] **Step 2: Run the end-to-end tests**

Run: `pnpm test:e2e`
Expected: PASS on every configured project (mobile and desktop).

- [ ] **Step 3: Note the work in the roadmap**

In `docs/superpowers/plans/2026-10-03-cabas-roadmap.md`, add a row after plan 2:

```markdown
| 2b | [Promotions](2026-10-08-promotions.md) | One promotion per purchase line (− € per item, − %, le Ne à −X %, N achetés = M offerts), net totals, regular prices kept for comparison | [Promotions spec](../specs/2026-10-08-promotions-design.md) |
```

- [ ] **Step 4: Full verification and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
git add tests/e2e/purchase.spec.ts docs/superpowers/plans/2026-10-03-cabas-roadmap.md
git commit -m "test(e2e): record a purchase with a promotion"
```

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch (pull request from `feat/promotions` to `main`; no AI mention in the PR).
