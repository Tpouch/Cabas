# cabas Plan 2 — Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record a grocery purchase (store, items with quantities and prices, total paid, receipt photo) from a phone or a PC, browse the purchase history by month, open, edit and delete a purchase, with every purchase line feeding the price comparison.

**Architecture:** Two new Prisma models (`Purchase`, `PurchaseItem`). Each item owns one `PriceObservation` (`source = PURCHASE`), written in the same transaction. Pure rules (line totals, quantity parsing, month grouping, draft parsing) live in `src/domain/` and `src/lib/`. One client form component (`PurchaseForm`) serves both `/purchases/new` and `/purchases/[id]/edit`; it keeps lines in React state, mirrors them to `localStorage` as a draft, and posts them to a Server Action as JSON.

**Tech Stack:** Same as Plan 1: Next.js 16, React 19.2, TypeScript strict, Prisma 7, PostgreSQL 18, Tailwind 4, shadcn/ui (Radix), Zod 4, sharp, Vitest + Testing Library + Testcontainers, Playwright, pnpm.

**Spec:** [`docs/superpowers/specs/2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md) §4 (Purchase, PurchaseItem, deletion rules), §5.4, §6.1, §6.2, §6.4, §6.5, §7, §8. Roadmap: [`2026-10-03-cabas-roadmap.md`](2026-10-03-cabas-roadmap.md). Read `CLAUDE.md` and `docs/best-practices.md` first.

## Global Constraints

- pnpm only. TDD for every behavior: failing test first, watch it fail, minimal code, refactor.
- Money in integer cents; display with `formatEuros` (`fr-FR`, `EUR`). Quantities are numbers with at most 3 decimals (DB `Decimal(10,3)`).
- Line subtotal = `Math.round(quantity × unitPriceCents)`; sum of lines = sum of subtotals (spec §5.4).
- Purchase dates are calendar dates (`@db.Date`, stored at UTC midnight); never shift them by time zone when displaying or grouping.
- UI copy French with the typographic apostrophe `’` in JSX text; code, comments and docs English.
- Mobile first, desktop layout from `lg` (1024 px). Touch targets ≥ 44 px, inputs 16 px (`Input` is already `h-11`).
- Theme "Ticket de caisse": prices and quantities in `font-mono`, savings in `text-savings`, receipt cards with `receipt-edge`.
- Server Actions validate with Zod, return `ActionResult`, never leak raw errors; ids from the client are checked with `isUuid`.
- Click-triggered actions go through `runAction` (toast on success and failure).
- Conventional Commits in English, no mention of Claude or AI.
- `pnpm lint && pnpm typecheck && pnpm test` pass before every commit.
- Work on branch `feat/purchases`; finish with a pull request.

## Review Focus

1. **Comma decimals in quantities and prices** ("1,2" kg at "2,49 €"): the line shows 2,99 € (rounded half up), the sum and saved purchase agree to the cent; "0", "-1", "1,2345" and "abc" quantities are refused. Pinned in Task 1.
2. **A stale or corrupted draft in `localStorage`** (invalid JSON, old shape, a product deleted since): the form opens normally, ignores what it cannot read, and drops lines whose product no longer exists. Pinned in Tasks 5 and 7.
3. **Deleting a product used in a purchase**: refused with a French message; deleting the purchase first removes its price observations, so the product's price list no longer shows that price. Pinned in Task 3.
4. **Editing a purchase** (other store, other prices, a removed line): no stale price stays attached to the old store or the removed line; the product pages show only the new prices. Pinned in Task 3.
5. **A purchase dated on the last day of a month** (e.g. 30 September) is grouped under that month and displayed with that date, whatever the server time zone. Pinned in Task 2.

---

## File Structure

```
prisma/schema.prisma                      # + Purchase, PurchaseItem, relations
prisma/migrations/<ts>_purchases/          # generated
src/domain/
  purchase.ts                             # lineSubtotal, sumOfLines, parseQuantity, formatQuantity, stepQuantity
  money.ts                                # + formatEurosInput
src/lib/
  format.ts                               # + formatLongDate, formatShortDate, formatMonthLabel
  purchase-months.ts                      # groupByMonth
  purchase-draft.ts                       # PurchaseDraft type, parseDraft, serializeDraft
src/server/
  repositories/purchases.ts               # createPurchase, updatePurchase, deletePurchase, listPurchases, getPurchase, latestPriceIndex
  repositories/products.ts                # deleteProduct maps in-use (P2003) to ProductInUseError
  actions/purchases.schema.ts             # purchaseInputSchema
  actions/purchases.ts                    # createPurchaseAction, updatePurchaseAction, deletePurchaseAction
  actions/products.ts                     # deleteProductAction: in-use message
src/components/
  common/use-form-action.ts               # onSubmit stops propagation (dialog forms inside the purchase form)
  products/product-form.tsx               # optional price field, onDone(product, priceCents)
  purchases/quantity-stepper.tsx
  purchases/receipt-field.tsx
  purchases/purchase-lines.tsx
  purchases/purchase-form.tsx
  purchases/purchase-history.tsx
  purchases/purchase-actions.tsx
  layout/nav-items.ts, layout/app-nav.tsx # Courses, central ＋, sidebar button, hidden bar on the form
src/app/purchases/
  page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx   # unknown ids use the root not-found page
tests/e2e/purchase.spec.ts
```

---

### Task 1: Purchase arithmetic and quantity parsing

**Files:**
- Create: `src/domain/purchase.ts`
- Modify: `src/domain/money.ts`
- Test: `src/domain/purchase.test.ts`, `src/domain/money.test.ts`

**Interfaces:**
- Produces:
  - `type PurchaseLine = { productId: string; quantity: number; unitPriceCents: number }`
  - `lineSubtotal(quantity: number, unitPriceCents: number): number` — `Math.round(quantity × unitPriceCents)`, computed on thousandths to avoid float drift.
  - `sumOfLines(lines: Pick<PurchaseLine, "quantity" | "unitPriceCents">[]): number`
  - `parseQuantity(input: string): number | null` — accepts `"2"`, `"1,2"`, `"1.25"`, `" 0,5 "`; at most 3 decimals; `> 0` and `≤ 9999`; otherwise `null`.
  - `formatQuantity(quantity: number): string` — French decimal, no grouping: `1.2 → "1,2"`, `2 → "2"`.
  - `stepQuantity(quantity: number, direction: 1 | -1): number` — adds or removes 1; never returns ≤ 0 (keeps the current value instead); result rounded to 3 decimals.
  - `formatEurosInput(cents: number): string` — `99 → "0,99"`, `123456 → "1234,56"` (what a price input shows).

- [ ] **Step 1: Write the failing tests**

Create `src/domain/purchase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatQuantity, lineSubtotal, parseQuantity, stepQuantity, sumOfLines } from "./purchase";

describe("lineSubtotal", () => {
  it("multiplies quantity by unit price and rounds to the cent", () => {
    expect(lineSubtotal(2, 99)).toBe(198);
    expect(lineSubtotal(1.2, 249)).toBe(299); // 298.8
    expect(lineSubtotal(0.75, 250)).toBe(188); // 187.5 rounds half up
  });

  it("does not drift on float quantities", () => {
    expect(lineSubtotal(0.1, 30)).toBe(3);
    expect(lineSubtotal(1.005, 1000)).toBe(1005);
  });
});

describe("sumOfLines", () => {
  it("sums rounded subtotals", () => {
    expect(
      sumOfLines([
        { quantity: 2, unitPriceCents: 99 },
        { quantity: 1.2, unitPriceCents: 249 },
        { quantity: 6, unitPriceCents: 109 },
      ]),
    ).toBe(198 + 299 + 654);
  });

  it("is zero without lines", () => {
    expect(sumOfLines([])).toBe(0);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["2", 2],
    ["1,2", 1.2],
    ["1.25", 1.25],
    [" 0,5 ", 0.5],
    ["0,125", 0.125],
    ["9999", 9999],
  ])("parses %j", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it.each(["", "0", "0,000", "-1", "1,2345", "abc", "1e3", "10000", "1,2,3"])("rejects %j", (input) => {
    expect(parseQuantity(input)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("writes French decimals without trailing zeros", () => {
    expect(formatQuantity(1.2)).toBe("1,2");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0.125)).toBe("0,125");
    expect(formatQuantity(1250)).toBe("1250");
  });
});

describe("stepQuantity", () => {
  it("adds or removes one unit", () => {
    expect(stepQuantity(2, 1)).toBe(3);
    expect(stepQuantity(1.2, 1)).toBe(2.2);
    expect(stepQuantity(2.2, -1)).toBe(1.2);
  });

  it("never goes to zero or below", () => {
    expect(stepQuantity(1, -1)).toBe(1);
    expect(stepQuantity(0.5, -1)).toBe(0.5);
  });
});
```

Append to `src/domain/money.test.ts`:

```ts
describe("formatEurosInput", () => {
  it("writes cents the way a price field shows them", () => {
    expect(formatEurosInput(99)).toBe("0,99");
    expect(formatEurosInput(1200)).toBe("12,00");
    expect(formatEurosInput(123456)).toBe("1234,56");
  });

  it("round-trips through parseEuros", () => {
    expect(parseEuros(formatEurosInput(249))).toBe(249);
  });
});
```

and change its first import line to `import { formatEuros, formatEurosInput, parseEuros } from "./money";`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm test src/domain/purchase.test.ts src/domain/money.test.ts`
Expected: FAIL — `Cannot find module './purchase'` and `formatEurosInput` is not exported.

- [ ] **Step 3: Implement**

Create `src/domain/purchase.ts`:

```ts
export type PurchaseLine = { productId: string; quantity: number; unitPriceCents: number };

const QUANTITY_PATTERN = /^\d+(?:[.,]\d{1,3})?$/;
const MAX_QUANTITY = 9999;
const quantityFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3, useGrouping: false });

/** Works on thousandths so 1.005 × 1000 is exactly 1005, then rounds half up. */
export function lineSubtotal(quantity: number, unitPriceCents: number): number {
  const thousandths = Math.round(quantity * 1000);
  return Math.round((thousandths * unitPriceCents) / 1000);
}

export function sumOfLines(lines: Pick<PurchaseLine, "quantity" | "unitPriceCents">[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line.quantity, line.unitPriceCents), 0);
}

export function parseQuantity(input: string): number | null {
  const compact = input.trim();
  if (!QUANTITY_PATTERN.test(compact)) return null;
  const quantity = Number(compact.replace(",", "."));
  return quantity > 0 && quantity <= MAX_QUANTITY ? quantity : null;
}

export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity);
}

export function stepQuantity(quantity: number, direction: 1 | -1): number {
  const next = Math.round((quantity + direction) * 1000) / 1000;
  return next > 0 ? next : quantity;
}
```

Append to `src/domain/money.ts`:

```ts
export function formatEurosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/domain/purchase.test.ts src/domain/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/purchase.ts src/domain/purchase.test.ts src/domain/money.ts src/domain/money.test.ts
git commit -m "feat(domain): add purchase line totals and quantity parsing"
```

---

### Task 2: Purchase dates and month grouping

**Files:**
- Create: `src/lib/purchase-months.ts`
- Modify: `src/lib/format.ts`
- Test: `src/lib/purchase-months.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `formatLongDate(date: Date): string` — `"vendredi 3 octobre 2026"` (UTC calendar day).
  - `formatShortDate(date: Date): string` — `"03/10"`.
  - `formatMonthLabel(month: string): string` — `"2026-10" → "Octobre 2026"`.
  - `monthKey(date: Date): string` — `"2026-10"` from the UTC calendar day.
  - `groupByMonth<T extends { purchasedAt: Date; totalCents: number }>(purchases: T[]): MonthGroup<T>[]` with `type MonthGroup<T> = { month: string; label: string; totalCents: number; purchases: T[] }` — newest month first; inside a month, the input order is kept (the repository already sorts newest first).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format.test.ts`:

```ts
describe("purchase dates", () => {
  it("formats a calendar date without shifting it", () => {
    const date = new Date("2026-10-03T00:00:00.000Z");
    expect(formatLongDate(date)).toBe("samedi 3 octobre 2026");
    expect(formatShortDate(date)).toBe("03/10");
  });

  it("keeps the last day of a month in that month", () => {
    expect(formatLongDate(new Date("2026-09-30T00:00:00.000Z"))).toBe("mercredi 30 septembre 2026");
  });

  it("names a month with a capital letter", () => {
    expect(formatMonthLabel("2026-10")).toBe("Octobre 2026");
    expect(formatMonthLabel("2027-01")).toBe("Janvier 2027");
  });
});
```

and extend its import line to `import { formatLongDate, formatMonthLabel, formatPerMeasure, formatPriceAge, formatShortDate, formatSize } from "./format";`.

Create `src/lib/purchase-months.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupByMonth, monthKey } from "./purchase-months";

const purchase = (id: string, iso: string, totalCents: number) => ({
  id,
  purchasedAt: new Date(`${iso}T00:00:00.000Z`),
  totalCents,
});

describe("monthKey", () => {
  it("uses the calendar month of the purchase date", () => {
    expect(monthKey(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09");
  });
});

describe("groupByMonth", () => {
  it("groups purchases by month, newest month first, with each month's total", () => {
    const groups = groupByMonth([
      purchase("a", "2026-10-03", 4862),
      purchase("b", "2026-09-30", 11230),
      purchase("c", "2026-09-24", 2790),
    ]);
    expect(groups).toEqual([
      { month: "2026-10", label: "Octobre 2026", totalCents: 4862, purchases: [expect.objectContaining({ id: "a" })] },
      {
        month: "2026-09",
        label: "Septembre 2026",
        totalCents: 14020,
        purchases: [expect.objectContaining({ id: "b" }), expect.objectContaining({ id: "c" })],
      },
    ]);
  });

  it("returns nothing for no purchases", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm test src/lib/format.test.ts src/lib/purchase-months.test.ts`
Expected: FAIL — missing exports `formatLongDate`… and `Cannot find module './purchase-months'`.

- [ ] **Step 3: Implement**

Append to `src/lib/format.ts`:

```ts
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
```

Create `src/lib/purchase-months.ts`:

```ts
import { formatMonthLabel } from "./format";

export type MonthGroup<T> = { month: string; label: string; totalCents: number; purchases: T[] };

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function groupByMonth<T extends { purchasedAt: Date; totalCents: number }>(purchases: T[]): MonthGroup<T>[] {
  const groups = new Map<string, MonthGroup<T>>();
  for (const purchase of purchases) {
    const month = monthKey(purchase.purchasedAt);
    const group = groups.get(month) ?? { month, label: formatMonthLabel(month), totalCents: 0, purchases: [] };
    group.totalCents += purchase.totalCents;
    group.purchases.push(purchase);
    groups.set(month, group);
  }
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month));
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/lib/format.test.ts src/lib/purchase-months.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/lib/purchase-months.ts src/lib/purchase-months.test.ts
git commit -m "feat(purchases): format purchase dates and group purchases by month"
```

---

### Task 3: Purchase storage

**Files:**
- Modify: `prisma/schema.prisma`; create migration `prisma/migrations/<timestamp>_purchases/`
- Create: `src/server/repositories/purchases.ts`
- Modify: `src/server/repositories/products.ts`, `src/server/actions/products.ts`
- Test: `src/server/repositories/purchases.test.ts`

**Interfaces:**
- Consumes: `db()`, `isUuid`, `StoreSummary`, `PurchaseLine` (Task 1), `listStorePrices` (Plan 1), `deleteProductAction`, `deleteStoreAction` (Plan 1).
- Produces:
  - Prisma models `Purchase` (`storeId`, `purchasedAt` date, `totalCents`, `receiptPath?`) and `PurchaseItem` (`purchaseId` cascade, `productId` restrict, `quantity Decimal(10,3)`, `unitPriceCents`); `PriceObservation.purchaseItem` relation with `onDelete: Cascade`.
  - `type PurchaseInput = { storeId: string; purchasedAt: Date; totalCents: number; receiptPath: string | null; lines: PurchaseLine[] }`
  - `type PurchaseListItem = { id: string; purchasedAt: Date; totalCents: number; receiptPath: string | null; itemCount: number; store: StoreSummary }`
  - `type PurchaseItemDetail = { id: string; quantity: number; unitPriceCents: number; product: { id: string; name: string; brand: string | null; photoPath: string | null; sizeValue: number; sizeUnit: SizeUnit } }`
  - `type PurchaseDetail = { id: string; purchasedAt: Date; totalCents: number; receiptPath: string | null; store: StoreSummary; items: PurchaseItemDetail[] }`
  - `type PriceIndex = Record<string, Record<string, number>>` — `index[storeId][productId]` = current price in cents.
  - `createPurchase(input: PurchaseInput): Promise<{ id: string }>`
  - `updatePurchase(id: string, input: PurchaseInput): Promise<{ previousReceiptPath: string | null }>` — `input.receiptPath === null` keeps the existing receipt.
  - `deletePurchase(id: string): Promise<{ receiptPath: string | null }>`
  - `listPurchases(): Promise<PurchaseListItem[]>` — newest `purchasedAt` first, then newest created.
  - `getPurchase(id: string): Promise<PurchaseDetail | null>` — `null` for unknown or malformed ids.
  - `latestPriceIndex(): Promise<PriceIndex>`
  - Errors: `PurchaseNotFoundError`, `UnknownReferenceError` (store or product deleted meanwhile), `ProductInUseError` (in `products.ts`).

- [ ] **Step 1: Extend the schema and migrate**

In `prisma/schema.prisma`:

1. In `model Store`, add the relation line after `prices    PriceObservation[]`:

```prisma
  purchases Purchase[]
```

2. In `model Product`, add after `prices         PriceObservation[]`:

```prisma
  purchaseItems  PurchaseItem[]
```

3. In `model PriceObservation`, replace the `purchaseItemId` doc comment line (`/// Linked to a purchase line in Plan 2 (foreign key added there).`) with `/// Set when the price comes from a purchase line; deleted with it.` and add after the `store` relation:

```prisma
  purchaseItem   PurchaseItem? @relation(fields: [purchaseItemId], references: [id], onDelete: Cascade)
```

4. Append the two models:

```prisma
model Purchase {
  id          String         @id @default(uuid(7)) @db.Uuid
  storeId     String         @map("store_id") @db.Uuid
  purchasedAt DateTime       @map("purchased_at") @db.Date
  totalCents  Int            @map("total_cents")
  receiptPath String?        @map("receipt_path")
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")
  store       Store          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  items       PurchaseItem[]

  @@index([purchasedAt])
  @@index([storeId])
  @@map("purchases")
}

model PurchaseItem {
  id               String            @id @default(uuid(7)) @db.Uuid
  purchaseId       String            @map("purchase_id") @db.Uuid
  productId        String            @map("product_id") @db.Uuid
  quantity         Decimal           @db.Decimal(10, 3)
  unitPriceCents   Int               @map("unit_price_cents")
  createdAt        DateTime          @default(now()) @map("created_at")
  updatedAt        DateTime          @updatedAt @map("updated_at")
  purchase         Purchase          @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  product          Product           @relation(fields: [productId], references: [id], onDelete: Restrict)
  priceObservation PriceObservation?

  @@index([purchaseId])
  @@index([productId])
  @@map("purchase_items")
}
```

Run: `docker compose -f docker-compose.dev.yml --env-file .env up -d && pnpm prisma migrate dev --name purchases && pnpm prisma generate`
Expected: a new migration folder `*_purchases` and a regenerated client.

- [ ] **Step 2: Write the failing storage tests**

Create `src/server/repositories/purchases.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deleteProductAction } from "@/server/actions/products";
import { deleteStoreAction } from "@/server/actions/stores";
import { db } from "@/server/db";
import { listStorePrices } from "./prices";
import {
  createPurchase,
  deletePurchase,
  getPurchase,
  latestPriceIndex,
  listPurchases,
  PurchaseNotFoundError,
  UnknownReferenceError,
  updatePurchase,
} from "./purchases";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function setup() {
  const lidl = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const auchan = await db().store.create({ data: { name: "Auchan", nameKey: "auchan" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  return { lidl, auchan, penne, apples };
}

describe("purchase storage", () => {
  it("saves a purchase, its lines and one purchase price per line", async () => {
    const { lidl, penne, apples } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 497,
      receiptPath: null,
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99 },
        { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
      ],
    });

    const purchase = await getPurchase(id);
    expect(purchase).toMatchObject({ totalCents: 497, store: { name: "Lidl" } });
    expect(purchase?.purchasedAt.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(purchase?.items.map((i) => [i.product.name, i.quantity, i.unitPriceCents])).toEqual([
      ["Penne", 2, 99],
      ["Pommes", 1.2, 249],
    ]);
    const observations = await db().priceObservation.findMany({ orderBy: { priceCents: "asc" } });
    expect(observations.map((o) => [o.storeId, o.priceCents, o.source, o.observedAt.toISOString()])).toEqual([
      [lidl.id, 99, "PURCHASE", "2026-10-03T00:00:00.000Z"],
      [lidl.id, 249, "PURCHASE", "2026-10-03T00:00:00.000Z"],
    ]);
  });

  it("writes nothing when a product no longer exists", async () => {
    const { lidl, penne } = await setup();
    await expect(
      createPurchase({
        storeId: lidl.id,
        purchasedAt: day("2026-10-03"),
        totalCents: 99,
        receiptPath: null,
        lines: [
          { productId: penne.id, quantity: 1, unitPriceCents: 99 },
          { productId: "01999999-0000-7000-8000-000000000000", quantity: 1, unitPriceCents: 10 },
        ],
      }),
    ).rejects.toThrow(UnknownReferenceError);
    expect(await db().purchase.count()).toBe(0);
    expect(await db().priceObservation.count()).toBe(0);
  });

  it("lists purchases newest first with their store and item count", async () => {
    const { lidl, auchan, penne } = await setup();
    const line = { productId: penne.id, quantity: 1, unitPriceCents: 99 };
    await createPurchase({ storeId: lidl.id, purchasedAt: day("2026-09-30"), totalCents: 99, receiptPath: null, lines: [line] });
    await createPurchase({ storeId: auchan.id, purchasedAt: day("2026-10-02"), totalCents: 198, receiptPath: null, lines: [line, line] });
    const list = await listPurchases();
    expect(list.map((p) => [p.store.name, p.itemCount, p.totalCents])).toEqual([
      ["Auchan", 2, 198],
      ["Lidl", 1, 99],
    ]);
  });

  it("replaces lines and their prices when a purchase is edited", async () => {
    const { lidl, auchan, penne, apples } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 497,
      receiptPath: "receipts/old.webp",
      lines: [
        { productId: penne.id, quantity: 2, unitPriceCents: 99 },
        { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
      ],
    });

    const result = await updatePurchase(id, {
      storeId: auchan.id,
      purchasedAt: day("2026-10-02"),
      totalCents: 95,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 95 }],
    });

    expect(result).toEqual({ previousReceiptPath: "receipts/old.webp" });
    const purchase = await getPurchase(id);
    expect(purchase).toMatchObject({ totalCents: 95, receiptPath: "receipts/old.webp", store: { name: "Auchan" } });
    expect(purchase?.items).toHaveLength(1);
    expect((await listStorePrices(penne.id)).map((r) => [r.store.name, r.priceCents])).toEqual([["Auchan", 95]]);
    expect(await listStorePrices(apples.id)).toEqual([]);
  });

  it("deletes a purchase with its lines and prices", async () => {
    const { lidl, penne } = await setup();
    const { id } = await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: "receipts/r.webp",
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deletePurchase(id)).toEqual({ receiptPath: "receipts/r.webp" });
    expect(await getPurchase(id)).toBeNull();
    expect(await db().purchaseItem.count()).toBe(0);
    expect(await listStorePrices(penne.id)).toEqual([]);
  });

  it("reports a purchase that no longer exists", async () => {
    await expect(deletePurchase("01999999-0000-7000-8000-000000000000")).rejects.toThrow(PurchaseNotFoundError);
    await expect(deletePurchase("abc")).rejects.toThrow(PurchaseNotFoundError);
    expect(await getPurchase("abc")).toBeNull();
  });

  it("indexes the current price of each product in each store", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-09-01"),
      totalCents: 89,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 89 }],
    });
    await db().priceObservation.create({
      data: { productId: penne.id, storeId: lidl.id, priceCents: 99, observedAt: day("2026-10-01"), source: "MANUAL" },
    });
    expect(await latestPriceIndex()).toEqual({ [lidl.id]: { [penne.id]: 99 } });
  });
});

describe("records used by purchases", () => {
  it("refuses to delete a product that appears in a purchase", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deleteProductAction(penne.id)).toMatchObject({
      ok: false,
      message: "Ce produit apparaît dans des courses : il ne peut pas être supprimé.",
    });
    expect(await db().product.count({ where: { id: penne.id } })).toBe(1);
    expect(await db().priceObservation.count()).toBe(1);
  });

  it("refuses to delete a store that has purchases", async () => {
    const { lidl, penne } = await setup();
    await createPurchase({
      storeId: lidl.id,
      purchasedAt: day("2026-10-03"),
      totalCents: 99,
      receiptPath: null,
      lines: [{ productId: penne.id, quantity: 1, unitPriceCents: 99 }],
    });
    expect(await deleteStoreAction(lidl.id)).toMatchObject({ ok: false, message: expect.stringContaining("ne peut pas être supprimé") });
  });
});
```

Run: `pnpm test src/server/repositories/purchases.test.ts`
Expected: FAIL — `Cannot find module './purchases'`.

- [ ] **Step 3: Implement the repository**

Create `src/server/repositories/purchases.ts`:

```ts
import "server-only";
import type { PurchaseLine } from "@/domain/purchase";
import type { SizeUnit } from "@/domain/types";
import { Prisma } from "@/generated/prisma/client";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";
import type { StoreSummary } from "./stores";

export class PurchaseNotFoundError extends Error {}
/** A store or product used by the purchase was deleted meanwhile. */
export class UnknownReferenceError extends Error {}

export type PurchaseInput = {
  storeId: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  lines: PurchaseLine[];
};

export type PurchaseListItem = {
  id: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  itemCount: number;
  store: StoreSummary;
};

export type PurchaseItemDetail = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  product: {
    id: string;
    name: string;
    brand: string | null;
    photoPath: string | null;
    sizeValue: number;
    sizeUnit: SizeUnit;
  };
};

export type PurchaseDetail = {
  id: string;
  purchasedAt: Date;
  totalCents: number;
  receiptPath: string | null;
  store: StoreSummary;
  items: PurchaseItemDetail[];
};

export type PriceIndex = Record<string, Record<string, number>>;

const storeSummary = { select: { id: true, name: true, address: true, logoPath: true } } as const;

/** Each line owns the purchase price observation written with it. */
function itemsCreate(input: PurchaseInput) {
  return {
    create: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      priceObservation: {
        create: {
          productId: line.productId,
          storeId: input.storeId,
          priceCents: line.unitPriceCents,
          observedAt: input.purchasedAt,
          source: "PURCHASE" as const,
        },
      },
    })),
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function createPurchase(input: PurchaseInput): Promise<{ id: string }> {
  try {
    return await db().purchase.create({
      data: {
        storeId: input.storeId,
        purchasedAt: input.purchasedAt,
        totalCents: input.totalCents,
        receiptPath: input.receiptPath,
        items: itemsCreate(input),
      },
      select: { id: true },
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new UnknownReferenceError();
    throw error;
  }
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<{ previousReceiptPath: string | null }> {
  if (!isUuid(id)) throw new PurchaseNotFoundError();
  try {
    return await db().$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({ where: { id }, select: { receiptPath: true } });
      if (!existing) throw new PurchaseNotFoundError();
      // Deleting the lines also deletes their price observations (cascade).
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.update({
        where: { id },
        data: {
          storeId: input.storeId,
          purchasedAt: input.purchasedAt,
          totalCents: input.totalCents,
          receiptPath: input.receiptPath ?? existing.receiptPath,
          items: itemsCreate(input),
        },
      });
      return { previousReceiptPath: existing.receiptPath };
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new UnknownReferenceError();
    throw error;
  }
}

export async function deletePurchase(id: string): Promise<{ receiptPath: string | null }> {
  if (!isUuid(id)) throw new PurchaseNotFoundError();
  try {
    return await db().purchase.delete({ where: { id }, select: { receiptPath: true } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) throw new PurchaseNotFoundError();
    throw error;
  }
}

export async function listPurchases(): Promise<PurchaseListItem[]> {
  const rows = await db().purchase.findMany({
    select: {
      id: true,
      purchasedAt: true,
      totalCents: true,
      receiptPath: true,
      store: storeSummary,
      _count: { select: { items: true } },
    },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(({ _count, ...purchase }) => ({ ...purchase, itemCount: _count.items }));
}

export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  if (!isUuid(id)) return null;
  const row = await db().purchase.findUnique({
    where: { id },
    select: {
      id: true,
      purchasedAt: true,
      totalCents: true,
      receiptPath: true,
      store: storeSummary,
      items: {
        select: {
          id: true,
          quantity: true,
          unitPriceCents: true,
          product: {
            select: { id: true, name: true, brand: true, photoPath: true, sizeValue: true, sizeUnit: true },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!row) return null;
  return { ...row, items: row.items.map((item) => ({ ...item, quantity: item.quantity.toNumber() })) };
}

export async function latestPriceIndex(): Promise<PriceIndex> {
  const rows = await db().priceObservation.findMany({
    select: { productId: true, storeId: true, priceCents: true },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
  });
  const index: PriceIndex = {};
  for (const row of rows) {
    const byProduct = (index[row.storeId] ??= {});
    byProduct[row.productId] ??= row.priceCents;
  }
  return index;
}
```

`orderBy: { id: "asc" }` keeps the lines in the order they were entered, because UUIDv7 ids are time-ordered.

In `src/server/repositories/products.ts`:

1. Add after `export class ProductNotFoundError extends Error {}`:

```ts
export class ProductInUseError extends Error {}
```

2. In `deleteProduct`, inside the `catch`, add before the existing `P2025` line:

```ts
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new ProductInUseError();
```

In `src/server/actions/products.ts`:

1. Add `ProductInUseError,` to the import from `@/server/repositories/products`.
2. In `deleteProductAction`, inside the `catch`, add before the `ProductNotFoundError` line:

```ts
    if (error instanceof ProductInUseError) {
      return failure("Ce produit apparaît dans des courses : il ne peut pas être supprimé.");
    }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/server/repositories/purchases.test.ts`
Expected: PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass (Plan 1 tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add prisma src/server/repositories src/server/actions/products.ts
git commit -m "feat(purchases): store purchases with their lines and purchase prices"
```

---

### Task 4: Purchase Server Actions

**Files:**
- Create: `src/server/actions/purchases.schema.ts`, `src/server/actions/purchases.ts`
- Test: `src/server/actions/purchases.test.ts`

**Interfaces:**
- Consumes: Task 3 repository, `parseEuros`, `todayIso`, `text`, `optionalFile`, `invalid`, `failure`, `saveImage`, `deleteImage`, `discardImage`, `ImageRejectedError`.
- Produces:
  - Form fields: `storeId`, `purchasedAt` (`YYYY-MM-DD`), `total` (e.g. `"23,47"`), `lines` (JSON array of `{ productId, quantity, unitPriceCents }` with numbers), `receipt` (file, optional).
  - `createPurchaseAction(prev: ActionState<{ id: string }>, formData: FormData): Promise<ActionResult<{ id: string }>>`
  - `updatePurchaseAction(id: string, prev: ActionState<{ id: string }>, formData: FormData): Promise<ActionResult<{ id: string }>>` — a new receipt replaces the old one; no receipt keeps it.
  - `deletePurchaseAction(id: string): Promise<ActionResult<null>>`
  - Error keys: `storeId`, `purchasedAt`, `total`, `lines`, `receipt`; `message` for missing records.

- [ ] **Step 1: Write the failing tests**

Create `src/server/actions/purchases.test.ts`:

```ts
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getPurchase } from "@/server/repositories/purchases";
import { createPurchaseAction, deletePurchaseAction, updatePurchaseAction } from "./purchases";

const uploads = () => process.env.UPLOADS_DIR as string;

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function receipt(): Promise<File> {
  const buffer = await sharp({ create: { width: 800, height: 2000, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  return new File([new Uint8Array(buffer)], "ticket.jpg", { type: "image/jpeg" });
}

async function receiptFiles(): Promise<string[]> {
  return readdir(join(uploads(), "receipts")).catch(() => []);
}

async function setup() {
  const store = await db().store.create({ data: { name: "Lidl", nameKey: "lidl" } });
  const penne = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const apples = await db().product.create({ data: { name: "Pommes", sizeValue: 1000, sizeUnit: "G" } });
  const fields = {
    storeId: store.id,
    purchasedAt: "2026-10-03",
    total: "4,97",
    lines: JSON.stringify([
      { productId: penne.id, quantity: 2, unitPriceCents: 99 },
      { productId: apples.id, quantity: 1.2, unitPriceCents: 249 },
    ]),
  };
  return { store, penne, apples, fields };
}

describe("createPurchaseAction", () => {
  it("records a purchase with its receipt", async () => {
    const { fields } = await setup();
    const result = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const purchase = await getPurchase(result.data.id);
    expect(purchase).toMatchObject({ totalCents: 497 });
    expect(purchase?.receiptPath).toMatch(/^receipts\/.+\.webp$/);
    expect(purchase?.items.map((i) => i.quantity)).toEqual([2, 1.2]);
  });

  it.each([
    [{ storeId: "" }, "storeId", "Choisis un magasin."],
    [{ purchasedAt: "2999-01-01" }, "purchasedAt", "La date ne peut pas être dans le futur."],
    [{ total: "" }, "total", "Indique le total payé, par exemple 23,47."],
    [{ lines: "[]" }, "lines", "Ajoute au moins un article."],
    [{ lines: "not json" }, "lines", "Vérifie la quantité et le prix de chaque article."],
    [{ lines: JSON.stringify([{ productId: "01999999-0000-7000-8000-000000000000", quantity: 0, unitPriceCents: 99 }]) }, "lines", "Vérifie la quantité et le prix de chaque article."],
  ])("rejects %j", async (override, field, message) => {
    const { fields } = await setup();
    const result = await createPurchaseAction(null, form({ ...fields, ...override }));
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await db().purchase.count()).toBe(0);
  });

  it("rejects a receipt that is not an image", async () => {
    const { fields } = await setup();
    const fake = new File([new TextEncoder().encode("%PDF-1.7")], "ticket.jpg", { type: "image/jpeg" });
    const result = await createPurchaseAction(null, form({ ...fields, receipt: fake }));
    expect(result).toMatchObject({ ok: false, errors: { receipt: ["Ce fichier n'est pas une image JPEG, PNG ou WebP."] } });
    expect(await db().purchase.count()).toBe(0);
  });

  it("explains that a product was deleted meanwhile and keeps no receipt file", async () => {
    const { fields, apples } = await setup();
    await db().product.delete({ where: { id: apples.id } });
    const result = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    expect(result).toMatchObject({ ok: false, message: "Un magasin ou un produit de cette course n'existe plus." });
    expect(await receiptFiles()).toEqual([]);
  });
});

describe("updatePurchaseAction", () => {
  it("replaces the receipt and removes the old file", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    const before = await getPurchase(created.data.id);

    const result = await updatePurchaseAction(created.data.id, null, form({ ...fields, total: "5,00", receipt: await receipt() }));
    expect(result).toEqual({ ok: true, data: { id: created.data.id } });
    const after = await getPurchase(created.data.id);
    expect(after?.totalCents).toBe(500);
    expect(after?.receiptPath).not.toBe(before?.receiptPath);
    await expect(stat(join(uploads(), before?.receiptPath as string))).rejects.toThrow();
  });

  it("keeps the receipt when none is sent", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    const before = await getPurchase(created.data.id);
    await updatePurchaseAction(created.data.id, null, form(fields));
    expect((await getPurchase(created.data.id))?.receiptPath).toBe(before?.receiptPath);
  });

  it.each(["01999999-0000-7000-8000-000000000000", "abc"])("reports purchase %s as gone", async (id) => {
    const { fields } = await setup();
    expect(await updatePurchaseAction(id, null, form(fields))).toMatchObject({ ok: false, message: "Cette course n'existe plus." });
  });
});

describe("deletePurchaseAction", () => {
  it("deletes the purchase and its receipt, then reports it as gone", async () => {
    const { fields } = await setup();
    const created = await createPurchaseAction(null, form({ ...fields, receipt: await receipt() }));
    if (!created.ok) throw new Error("setup failed");
    expect(await deletePurchaseAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await receiptFiles()).toEqual([]);
    expect(await deletePurchaseAction(created.data.id)).toMatchObject({ ok: false, message: "Cette course n'existe plus." });
  });
});
```

Run: `pnpm test src/server/actions/purchases.test.ts`
Expected: FAIL — `Cannot find module './purchases'`.

- [ ] **Step 2: Implement the schema**

Create `src/server/actions/purchases.schema.ts`:

```ts
import { z } from "zod";
import { parseEuros } from "@/domain/money";
import { todayIso } from "@/lib/dates";

const LINES_ERROR = "Vérifie la quantité et le prix de chaque article.";

const lineSchema = z.object({
  productId: z.uuid({ error: LINES_ERROR }),
  quantity: z
    .number({ error: LINES_ERROR })
    .positive(LINES_ERROR)
    .max(9999, LINES_ERROR)
    .refine((quantity) => Number.isInteger(Math.round(quantity * 1000 * 1e6) / 1e6), LINES_ERROR),
  unitPriceCents: z.number({ error: LINES_ERROR }).int(LINES_ERROR).positive(LINES_ERROR).max(9_999_999, LINES_ERROR),
});

export const purchaseInputSchema = z.object({
  storeId: z.uuid({ error: "Choisis un magasin." }),
  purchasedAt: z.iso
    .date({ error: "Indique une date valide." })
    .refine((value) => value <= todayIso(), "La date ne peut pas être dans le futur.")
    .transform((value) => new Date(`${value}T00:00:00Z`)),
  total: z
    .string()
    .transform((value) => parseEuros(value))
    .pipe(
      z
        .number({ error: "Indique le total payé, par exemple 23,47." })
        .max(9_999_999, "Le total doit être inférieur à 100 000 €."),
    ),
  lines: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: LINES_ERROR });
        return z.NEVER;
      }
    })
    .pipe(z.array(lineSchema, { error: LINES_ERROR }).min(1, "Ajoute au moins un article.")),
});
```

The quantity refine accepts at most 3 decimals (the `1e6` factor absorbs float noise such as `1.2 × 1000 = 1199.9999…`).

- [ ] **Step 3: Implement the actions**

Create `src/server/actions/purchases.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createPurchase,
  deletePurchase,
  PurchaseNotFoundError,
  UnknownReferenceError,
  updatePurchase,
} from "@/server/repositories/purchases";
import { deleteImage, discardImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { purchaseInputSchema } from "./purchases.schema";
import { type ActionResult, type ActionState, failure, invalid } from "./result";

const GONE = "Cette course n'existe plus.";
const REFERENCE_GONE = "Un magasin ou un produit de cette course n'existe plus.";

function parse(formData: FormData) {
  return purchaseInputSchema.safeParse({
    storeId: text(formData, "storeId"),
    purchasedAt: text(formData, "purchasedAt"),
    total: text(formData, "total"),
    lines: text(formData, "lines"),
  });
}

async function saveReceipt(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "receipt");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "receipts") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

/** Purchases change product prices and statistics everywhere. */
function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createPurchaseAction(
  _prev: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const receipt = await saveReceipt(formData);
  if ("error" in receipt) return { ok: false, errors: { receipt: [receipt.error] } };

  const { total, ...input } = parsed.data;
  try {
    const { id } = await createPurchase({ ...input, totalCents: total, receiptPath: receipt.path });
    revalidateAll();
    return { ok: true, data: { id } };
  } catch (error) {
    await deleteImage(receipt.path);
    if (error instanceof UnknownReferenceError) return failure(REFERENCE_GONE);
    throw error;
  }
}

export async function updatePurchaseAction(
  id: string,
  _prev: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const receipt = await saveReceipt(formData);
  if ("error" in receipt) return { ok: false, errors: { receipt: [receipt.error] } };

  const { total, ...input } = parsed.data;
  let previousReceiptPath: string | null;
  try {
    ({ previousReceiptPath } = await updatePurchase(id, { ...input, totalCents: total, receiptPath: receipt.path }));
  } catch (error) {
    await deleteImage(receipt.path);
    if (error instanceof PurchaseNotFoundError) return failure(GONE);
    if (error instanceof UnknownReferenceError) return failure(REFERENCE_GONE);
    throw error;
  }
  if (receipt.path) await discardImage(previousReceiptPath);
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deletePurchaseAction(id: string): Promise<ActionResult<null>> {
  let receiptPath: string | null;
  try {
    ({ receiptPath } = await deletePurchase(id));
  } catch (error) {
    if (error instanceof PurchaseNotFoundError) return failure(GONE);
    throw error;
  }
  await discardImage(receiptPath);
  revalidateAll();
  return { ok: true, data: null };
}
```

`tests/setup/integration.ts` mocks `next/cache` with `revalidatePath: vi.fn()`, which accepts the second `"layout"` argument.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm test src/server/actions/purchases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/purchases.ts src/server/actions/purchases.schema.ts src/server/actions/purchases.test.ts
git commit -m "feat(purchases): add server actions to record, edit and delete purchases"
```

---

### Task 5: Purchase draft

**Files:**
- Create: `src/lib/purchase-draft.ts`
- Test: `src/lib/purchase-draft.test.ts`

**Interfaces:**
- Produces:
  - `type DraftLine = { key: string; productId: string; quantity: string; unitPrice: string }` — raw input strings, so half-typed values survive a reload.
  - `type PurchaseDraft = { storeId: string | null; purchasedAt: string; lines: DraftLine[]; total: string; totalEdited: boolean }`
  - `DRAFT_STORAGE_KEY = "cabas:purchase-draft:v1"`
  - `serializeDraft(draft: PurchaseDraft): string`
  - `parseDraft(raw: string | null, known: { storeIds: Set<string>; productIds: Set<string> }): PurchaseDraft | null` — `null` for missing, invalid JSON or wrong shape; forgets a store that no longer exists; drops lines whose product no longer exists.
  - `isEmptyDraft(draft: PurchaseDraft): boolean` — no store, no line and no total.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/purchase-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isEmptyDraft, parseDraft, type PurchaseDraft, serializeDraft } from "./purchase-draft";

const known = { storeIds: new Set(["lidl"]), productIds: new Set(["penne", "pommes"]) };

const draft: PurchaseDraft = {
  storeId: "lidl",
  purchasedAt: "2026-10-03",
  lines: [
    { key: "a", productId: "penne", quantity: "2", unitPrice: "0,99" },
    { key: "b", productId: "pommes", quantity: "1,", unitPrice: "" },
  ],
  total: "4,97",
  totalEdited: true,
};

describe("purchase draft", () => {
  it("round-trips a draft, half-typed values included", () => {
    expect(parseDraft(serializeDraft(draft), known)).toEqual(draft);
  });

  it.each([null, "", "not json", "42", JSON.stringify({ storeId: 3 }), JSON.stringify({ ...draft, lines: "x" })])(
    "ignores unreadable content %j",
    (raw) => {
      expect(parseDraft(raw, known)).toBeNull();
    },
  );

  it("drops lines whose product was deleted and forgets a deleted store", () => {
    const restored = parseDraft(serializeDraft(draft), { storeIds: new Set(), productIds: new Set(["penne"]) });
    expect(restored?.storeId).toBeNull();
    expect(restored?.lines.map((l) => l.productId)).toEqual(["penne"]);
  });

  it("knows when a draft holds nothing worth restoring", () => {
    expect(isEmptyDraft({ storeId: null, purchasedAt: "2026-10-03", lines: [], total: "", totalEdited: false })).toBe(true);
    expect(isEmptyDraft(draft)).toBe(false);
  });
});
```

Run: `pnpm test src/lib/purchase-draft.test.ts`
Expected: FAIL — `Cannot find module './purchase-draft'`.

- [ ] **Step 2: Implement**

Create `src/lib/purchase-draft.ts`:

```ts
import { z } from "zod";

export const DRAFT_STORAGE_KEY = "cabas:purchase-draft:v1";

const draftLineSchema = z.object({
  key: z.string(),
  productId: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
});

const draftSchema = z.object({
  storeId: z.string().nullable(),
  purchasedAt: z.string(),
  lines: z.array(draftLineSchema),
  total: z.string(),
  totalEdited: z.boolean(),
});

export type DraftLine = z.infer<typeof draftLineSchema>;
export type PurchaseDraft = z.infer<typeof draftSchema>;

export function serializeDraft(draft: PurchaseDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(
  raw: string | null,
  known: { storeIds: Set<string>; productIds: Set<string> },
): PurchaseDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return null;
  const draft = parsed.data;
  return {
    ...draft,
    storeId: draft.storeId && known.storeIds.has(draft.storeId) ? draft.storeId : null,
    lines: draft.lines.filter((line) => known.productIds.has(line.productId)),
  };
}

export function isEmptyDraft(draft: PurchaseDraft): boolean {
  return draft.storeId === null && draft.lines.length === 0 && draft.total.trim() === "";
}
```

- [ ] **Step 3: Run the tests to see them pass**

Run: `pnpm test src/lib/purchase-draft.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/purchase-draft.ts src/lib/purchase-draft.test.ts
git commit -m "feat(purchases): serialize and restore purchase drafts safely"
```

---

### Task 6: Form building blocks (stepper, receipt drop zone, product price field)

**Files:**
- Create: `src/components/common/use-file-preview.ts`, `src/components/purchases/quantity-stepper.tsx`, `src/components/purchases/receipt-field.tsx`
- Modify: `src/components/common/use-form-action.ts`, `src/components/common/image-field.tsx`, `src/components/products/product-form.tsx`
- Test: `src/components/common/use-form-action.test.tsx`, `src/components/purchases/quantity-stepper.test.tsx`, `src/components/purchases/receipt-field.test.tsx`, `src/components/products/product-form.test.tsx`

**Interfaces:**
- Consumes: `parseQuantity`, `formatQuantity`, `stepQuantity` (Task 1), `parseEuros`, `formatPerMeasure`, `uploadUrl`, `FieldError`.
- Produces:
  - `useFormAction` — `onSubmit` also calls `event.stopPropagation()`, so a form rendered in a dialog (a React portal) never submits the purchase form around it.
  - `useFilePreview(currentUrl: string | null): { preview: string | null; showFile: (file: File | undefined) => void }` — owns blob URLs and revokes them.
  - `<QuantityStepper id label value onChange />` — `value: string`, `onChange: (value: string) => void`; buttons "Diminuer" / "Augmenter" (44 px), decimal input, `aria-invalid` when the value is not a valid quantity.
  - `<ReceiptField name currentPath? errors? />` — file picker plus drag-and-drop zone; the dropped file lands in the input, so `new FormData(form)` carries it.
  - `ProductForm` gains `priceLabel?: string`; when set, it shows a price input with a live price per unit of measure, and calls `onDone(product, priceCents)` where `priceCents: number | null`. Existing callers that take one argument keep working.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/common/use-form-action.test.tsx`:

```tsx
describe("useFormAction inside another form", () => {
  it("does not submit the surrounding form", async () => {
    const { createPortal } = await import("react-dom");
    const outer = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    function Inner() {
      const { onSubmit } = useFormAction(async () => ({ ok: true as const, data: null }), () => {});
      return (
        <form onSubmit={onSubmit}>
          <button type="submit">Créer le magasin</button>
        </form>
      );
    }
    render(
      <form onSubmit={outer}>
        {createPortal(<Inner />, document.body)}
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Créer le magasin" }));
    expect(outer).not.toHaveBeenCalled();
  });
});
```

Create `src/components/purchases/quantity-stepper.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { QuantityStepper } from "./quantity-stepper";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper id="q" label="Quantité de Pommes" value={value} onChange={setValue} />;
}

describe("QuantityStepper", () => {
  it("adds and removes one unit, keeping decimals", async () => {
    render(<Harness initial="1,2" />);
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("2,2");
    await userEvent.click(screen.getByRole("button", { name: "Diminuer" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("1,2");
  });

  it("never goes below a positive quantity", async () => {
    render(<Harness initial="1" />);
    await userEvent.click(screen.getByRole("button", { name: "Diminuer" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("1");
  });

  it("accepts a typed weight and flags an invalid value", async () => {
    render(<Harness initial="1" />);
    const input = screen.getByLabelText("Quantité de Pommes");
    await userEvent.clear(input);
    await userEvent.type(input, "0,75");
    expect(input).toHaveValue("0,75");
    expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("starts from 1 when the field holds no valid number", async () => {
    render(<Harness initial="" />);
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Pommes")).toHaveValue("2");
  });
});
```

Create `src/components/purchases/receipt-field.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReceiptField } from "./receipt-field";

describe("ReceiptField", () => {
  it("puts a dropped photo into the form", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:ticket"), revokeObjectURL: vi.fn() });
    // jsdom cannot build a FileList by hand: borrow one from a scratch input.
    const scratch = document.createElement("input");
    scratch.type = "file";
    document.body.append(scratch);
    await userEvent.upload(scratch, new File(["x"], "ticket.jpg", { type: "image/jpeg" }));

    render(
      <form aria-label="course">
        <ReceiptField name="receipt" />
      </form>,
    );
    fireEvent.drop(screen.getByText(/Glisse la photo du ticket/), { dataTransfer: { files: scratch.files } });

    const form = screen.getByRole("form", { name: "course" }) as HTMLFormElement;
    expect((new FormData(form).get("receipt") as File).name).toBe("ticket.jpg");
    expect(screen.getByRole("img", { name: "Aperçu du ticket" })).toHaveAttribute("src", "blob:ticket");
  });

  it("shows the error under the field", () => {
    render(<ReceiptField name="receipt" errors={["L'image dépasse 10 Mo."]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("L'image dépasse 10 Mo.");
    expect(screen.getByLabelText(/Photo du ticket/)).toHaveAttribute("aria-invalid", "true");
  });
});
```

Append to `src/components/products/product-form.test.tsx`:

```tsx
describe("ProductForm inside a purchase", () => {
  it("asks for the price in the store, shows the price per kilo and hands the price back", async () => {
    const product = { id: "p1", name: "Riz", brand: null, photoPath: null, sizeValue: 1000, sizeUnit: "G" as const, bestPriceCents: null };
    const action = vi.fn().mockResolvedValue({ ok: true, data: product });
    const onDone = vi.fn();
    render(<ProductForm action={action} defaultName="Riz" priceLabel="Prix chez Lidl" onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Contenance"), "1000");
    await userEvent.type(screen.getByLabelText("Prix chez Lidl"), "2,79");
    expect(screen.getByText(/= 2,79\s€\/kg/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(product, 279));
  });

  it("has no price field on its own", () => {
    render(<ProductForm action={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByLabelText(/Prix/)).not.toBeInTheDocument();
  });
});
```

Run: `pnpm test --project components`
Expected: FAIL — the surrounding form is submitted, `./quantity-stepper` and `./receipt-field` are missing, and the price field does not exist.

- [ ] **Step 2: Stop dialog submissions from bubbling**

In `src/components/common/use-form-action.ts`, change `onSubmit` to:

```ts
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React events bubble through portals: keep a dialog form from submitting the page form.
    event.stopPropagation();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }
```

- [ ] **Step 3: Extract the preview hook and build the receipt field**

Create `src/components/common/use-file-preview.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Shows a chosen file as a blob URL and frees it when replaced or unmounted. */
export function useFilePreview(currentUrl: string | null) {
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function showFile(file: File | undefined) {
    setPreview(file ? URL.createObjectURL(file) : currentUrl);
  }

  return { preview, showFile };
}
```

Replace the body of `src/components/common/image-field.tsx` so it uses the hook (same markup and props as today):

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadUrl } from "@/lib/uploads";
import { useFilePreview } from "./use-file-preview";

type Props = { name: string; label: string; currentPath?: string | null; errors?: string[] };

export function ImageField({ name, label, currentPath, errors }: Props) {
  const { preview, showFile } = useFilePreview(currentPath ? uploadUrl(currentPath, { thumb: true }) : null);
  const errorId = `${name}-error`;

  return (
    <div className="flex items-center gap-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border border-dashed bg-secondary">
        {preview && <img src={preview} alt="" className="size-full object-cover" />}
      </div>
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={errors ? true : undefined}
          aria-describedby={errors ? errorId : undefined}
          onChange={(event) => showFile(event.currentTarget.files?.[0])}
        />
        {errors && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {errors[0]}
          </p>
        )}
      </div>
    </div>
  );
}
```

Create `src/components/purchases/receipt-field.tsx`:

```tsx
"use client";

import { Camera } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { useFilePreview } from "@/components/common/use-file-preview";
import { uploadUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type Props = { name: string; currentPath?: string | null; errors?: string[] };

/** File picker that also accepts a dropped photo (desktop). Phones offer camera or gallery. */
export function ReceiptField({ name, currentPath, errors }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { preview, showFile } = useFilePreview(currentPath ? uploadUrl(currentPath, { thumb: true }) : null);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    if (!inputRef.current || files.length === 0) return;
    inputRef.current.files = files;
    showFile(files[0]);
  }

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={name}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-28 cursor-pointer items-center gap-3 rounded-md border border-dashed bg-secondary/50 p-3 text-sm text-muted-foreground",
          dragging && "border-primary bg-secondary",
          errors && "border-destructive",
        )}
      >
        {preview ? (
          <img src={preview} alt="Aperçu du ticket" className="h-24 w-16 rounded-sm object-cover" />
        ) : (
          <Camera className="size-6 shrink-0 text-primary" aria-hidden />
        )}
        <span>
          <span className="block font-semibold text-foreground">Photo du ticket</span>
          Glisse la photo du ticket ici, ou touche pour la prendre ou la choisir.
        </span>
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? `${name}-error` : undefined}
        onChange={(event) => showFile(event.currentTarget.files?.[0])}
      />
      <FieldError id={`${name}-error`} errors={errors} />
    </div>
  );
}
```

The input has no `capture` attribute on purpose: phones then offer both the camera and the photo library (spec §6.4 asks for camera capture; Plan 1's review showed `capture` blocks the gallery).

- [ ] **Step 4: Build the quantity stepper**

Create `src/components/purchases/quantity-stepper.tsx`:

```tsx
"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatQuantity, parseQuantity, stepQuantity } from "@/domain/purchase";

type Props = { id: string; label: string; value: string; onChange: (value: string) => void };

export function QuantityStepper({ id, label, value, onChange }: Props) {
  const quantity = parseQuantity(value);

  function step(direction: 1 | -1) {
    onChange(formatQuantity(stepQuantity(quantity ?? 1, direction)));
  }

  return (
    <div className="flex h-11 items-center rounded-md border bg-card">
      <Button type="button" variant="ghost" size="icon" className="size-11 text-primary" aria-label="Diminuer" onClick={() => step(-1)}>
        <Minus aria-hidden />
      </Button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={quantity === null ? true : undefined}
        className="h-full w-14 bg-transparent text-center font-mono text-base outline-none aria-invalid:text-destructive"
      />
      <Button type="button" variant="ghost" size="icon" className="size-11 text-primary" aria-label="Augmenter" onClick={() => step(1)}>
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Add the optional price field to the product form**

Replace `src/components/products/product-form.tsx` with:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEuros } from "@/domain/money";
import type { SizeUnit } from "@/domain/types";
import { formatPerMeasure } from "@/lib/format";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";

type Props = {
  action: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
  product?: ProductSummary;
  defaultName?: string;
  /** Shown when the product is created from a purchase: its price in that store. */
  priceLabel?: string;
  onDone: (product: ProductSummary, priceCents: number | null) => void;
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProductForm({ action, product, defaultName, priceLabel, onDone }: Props) {
  const [sizeValue, setSizeValue] = useState(product?.sizeValue ? String(product.sizeValue) : "");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(product?.sizeUnit ?? "G");
  const [price, setPrice] = useState("");
  const priceRef = useRef<number | null>(null);
  const done = useCallback((saved: ProductSummary) => onDone(saved, priceRef.current), [onDone]);
  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, done);

  const priceCents = parseEuros(price);
  const size = Number(sizeValue);
  const perMeasure =
    priceCents && Number.isInteger(size) && size > 0 ? `= ${formatPerMeasure(priceCents, size, sizeUnit)}` : " ";

  return (
    <form ref={formRef} className="grid gap-4" noValidate onSubmit={onSubmit}>
      <ImageField name="photo" label="Photo (facultatif)" currentPath={product?.photoPath} errors={errors.photo} />
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" errors={errors.name} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="brand">
          Marque <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} autoComplete="off" />
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sizeValue">Contenance</Label>
          <Input
            id="sizeValue"
            name="sizeValue"
            inputMode="numeric"
            className="font-mono"
            value={sizeValue}
            onChange={(event) => setSizeValue(event.target.value)}
            aria-invalid={errors.sizeValue ? true : undefined}
            aria-describedby={errors.sizeValue || errors.sizeUnit ? "sizeValue-error" : "sizeValue-help"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sizeUnit">Unité</Label>
          <select
            id="sizeUnit"
            name="sizeUnit"
            value={sizeUnit}
            onChange={(event) => setSizeUnit(event.target.value as SizeUnit)}
            className={selectClass}
            aria-invalid={errors.sizeUnit ? true : undefined}
          >
            <option value="G">g</option>
            <option value="ML">ml</option>
            <option value="PIECE">pièces</option>
          </select>
        </div>
        <div className="col-span-2 -mt-1">
          <FieldError id="sizeValue-error" errors={errors.sizeValue ?? errors.sizeUnit} />
          {!errors.sizeValue && !errors.sizeUnit && (
            <p id="sizeValue-help" className="text-xs text-muted-foreground">
              En grammes, millilitres ou pièces : 1,5 kg = 1500 g.
            </p>
          )}
        </div>
      </div>
      {priceLabel && (
        <div className="grid gap-1.5">
          <Label htmlFor="price">{priceLabel}</Label>
          <Input
            id="price"
            inputMode="decimal"
            className="font-mono"
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
              priceRef.current = parseEuros(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">{perMeasure}</p>
        </div>
      )}
      {state && !state.ok && state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
```

The price input has no `name`: it is never sent to `createProductAction`; the purchase uses it as the new line's unit price.

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm test --project components`
Expected: PASS (new tests and all Plan 1 component tests).

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components
git commit -m "feat(purchases): add quantity stepper, receipt drop zone and product price field"
```

---

### Task 7: New purchase form and navigation

**Files:**
- Create: `src/components/purchases/purchase-lines.tsx`, `src/components/purchases/purchase-form.tsx`, `src/app/purchases/new/page.tsx`
- Modify: `src/components/layout/nav-items.ts`, `src/components/layout/app-nav.tsx`
- Test: `src/components/purchases/purchase-form.test.tsx`, `src/components/layout/app-nav.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6; `EntityCombobox`, `ResponsiveDialog`, `StoreForm`, `SubmitButton`, `FieldError`, `useFormAction` (Plan 1); `createStoreAction`, `createProductAction`, `listStores`, `listProducts`, `todayIso`.
- Produces:
  - `<PurchaseLines lines productsById onChange onRemove />` with `onChange: (key: string, patch: Partial<DraftLine>) => void`, `onRemove: (key: string) => void`.
  - `<PurchaseForm mode stores products priceIndex today initial? receiptPath? action createStore createProduct />`:
    - `mode: "create" | "edit"` — only `create` reads and writes the `localStorage` draft;
    - `initial?: PurchaseDraft` — the purchase being edited;
    - `action: (prev: ActionState<{ id: string }>, formData: FormData) => Promise<ActionResult<{ id: string }>>`;
    - `createStore` / `createProduct`: the Plan 1 action signatures.
    After a successful save it clears the draft (create mode), shows "Course enregistrée" and navigates to `/purchases/<id>`.
  - Navigation: mobile bar Accueil · Courses · ＋ (`/purchases/new`, label "Nouvelle course") · Produits · Magasins; desktop sidebar with a "Nouvelle course" button above the menu; the mobile bar is hidden on `/purchases/new` and `/purchases/<id>/edit` (spec §6.1).

- [ ] **Step 1: Write the failing navigation tests**

Replace `src/components/layout/app-nav.test.tsx` with:

```tsx
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

let pathname = "/products/0199-abc";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AppNav", () => {
  beforeEach(() => {
    pathname = "/products/0199-abc";
  });

  it("links every section in the mobile bar and the desktop sidebar", () => {
    render(<AppNav />);
    for (const nav of [
      screen.getByRole("navigation", { name: "Navigation principale" }),
      screen.getByRole("navigation", { name: "Menu" }),
    ]) {
      expect(within(nav).getByRole("link", { name: /Accueil/ })).toHaveAttribute("href", "/");
      expect(within(nav).getByRole("link", { name: /Courses/ })).toHaveAttribute("href", "/purchases");
      expect(within(nav).getByRole("link", { name: /Produits/ })).toHaveAttribute("href", "/products");
      expect(within(nav).getByRole("link", { name: /Magasins/ })).toHaveAttribute("href", "/stores");
    }
  });

  it("offers a new purchase from the mobile bar and the sidebar", () => {
    render(<AppNav />);
    const links = screen.getAllByRole("link", { name: "Nouvelle course" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/purchases/new");
  });

  it("marks the section of the current page as active", () => {
    render(<AppNav />);
    const sidebar = screen.getByRole("navigation", { name: "Menu" });
    expect(within(sidebar).getByRole("link", { name: /Produits/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: /Accueil/ })).not.toHaveAttribute("aria-current");
  });

  it.each(["/purchases/new", "/purchases/0199-abc/edit"])("hides the mobile bar on the purchase form %s", (path) => {
    pathname = path;
    render(<AppNav />);
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu" })).toBeInTheDocument();
  });
});
```

Run: `pnpm test src/components/layout/app-nav.test.tsx`
Expected: FAIL — no "Courses" link, no "Nouvelle course" link, the bar is still shown on the form.

- [ ] **Step 2: Update the navigation**

Replace `src/components/layout/nav-items.ts`:

```ts
import { House, LayoutGrid, type LucideIcon, ReceiptText, Store } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", icon: House, mobile: true },
  { href: "/purchases", label: "Courses", icon: ReceiptText, mobile: true },
  { href: "/products", label: "Produits", icon: LayoutGrid, mobile: true },
  { href: "/stores", label: "Magasins", icon: Store, mobile: true },
];

export const NEW_PURCHASE_HREF = "/purchases/new";

/** The purchase form has its own fixed save bar (spec §6.1). */
export function hidesMobileBar(pathname: string): boolean {
  return pathname === NEW_PURCHASE_HREF || /^\/purchases\/[^/]+\/edit$/.test(pathname);
}

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
```

Replace `src/components/layout/app-nav.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hidesMobileBar, isActive, NAV_ITEMS, NEW_PURCHASE_HREF, type NavItem } from "./nav-items";

function MobileLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item.href, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground",
        active && "font-bold text-primary",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);
  const middle = Math.ceil(mobileItems.length / 2);

  return (
    <>
      {!hidesMobileBar(pathname) && (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {mobileItems.slice(0, middle).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
          <Link
            href={NEW_PURCHASE_HREF}
            aria-label="Nouvelle course"
            className="-mt-5 grid size-14 place-items-center self-start rounded-2xl bg-primary text-primary-foreground shadow-lg active:scale-95"
          >
            <Plus className="size-6" aria-hidden />
          </Link>
          {mobileItems.slice(middle).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      )}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-1 border-r bg-card px-3 py-4 lg:flex">
        <Link href="/" className="px-2 pb-4 font-serif text-2xl font-bold">
          cabas
        </Link>
        <Link
          href={NEW_PURCHASE_HREF}
          className="mb-3 flex h-10 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Nouvelle course
        </Link>
        <nav aria-label="Menu" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 font-medium text-muted-foreground hover:bg-secondary",
                  active && "bg-secondary font-bold text-primary",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
```

The sidebar "Nouvelle course" link sits outside `nav[aria-label=Menu]`, so the menu test still finds exactly the four sections.

Run: `pnpm test src/components/layout/app-nav.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing purchase form tests**

Create `src/components/purchases/purchase-form.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, serializeDraft } from "@/lib/purchase-draft";
import { PurchaseForm } from "./purchase-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const stores = [{ id: "lidl", name: "Lidl", address: null, logoPath: null }];
const penne = { id: "penne", name: "Penne Rigate", brand: "Barilla", photoPath: null, sizeValue: 500, sizeUnit: "G" as const, bestPriceCents: 99 };
const riz = { id: "riz", name: "Riz", brand: null, photoPath: null, sizeValue: 1000, sizeUnit: "G" as const, bestPriceCents: null };
const priceIndex = { lidl: { penne: 99 } };

function renderForm(overrides: Partial<Parameters<typeof PurchaseForm>[0]> = {}) {
  const props = {
    mode: "create" as const,
    stores,
    products: [penne],
    priceIndex,
    today: "2026-10-03",
    action: vi.fn().mockResolvedValue({ ok: true, data: { id: "p1" } }),
    createStore: vi.fn(),
    createProduct: vi.fn(),
    ...overrides,
  };
  render(<PurchaseForm {...props} />);
  return props;
}

async function chooseStore() {
  await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
  await userEvent.click(screen.getByRole("option", { name: "Lidl" }));
}

async function addPenne() {
  await userEvent.click(screen.getByRole("combobox", { name: "Ajouter un article" }));
  await userEvent.click(screen.getByRole("option", { name: "Penne Rigate · Barilla · 500 g" }));
}

describe("PurchaseForm", () => {
  afterEach(() => {
    window.localStorage.clear();
    push.mockReset();
  });

  it("prefills the store's current price and keeps a running sum", async () => {
    renderForm();
    await chooseStore();
    await addPenne();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("0,99");
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("2");
    expect(screen.getByLabelText("Total payé")).toHaveValue("1,98");
    expect(screen.getAllByText(/1,98\s€/).length).toBeGreaterThan(0);
  });

  it("keeps a total the user typed", async () => {
    renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.clear(screen.getByLabelText("Total payé"));
    await userEvent.type(screen.getByLabelText("Total payé"), "0,50");
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    expect(screen.getByLabelText("Total payé")).toHaveValue("0,50");
  });

  it("fills empty prices when the store is chosen after the items", async () => {
    renderForm();
    await addPenne();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("");
    await chooseStore();
    expect(screen.getByLabelText("Prix unitaire de Penne Rigate")).toHaveValue("0,99");
  });

  it("adds one more to an item that is already listed", async () => {
    renderForm();
    await addPenne();
    await addPenne();
    expect(screen.getAllByLabelText("Quantité de Penne Rigate")).toHaveLength(1);
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("2");
  });

  it("restores a draft and drops items whose product was deleted", async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      serializeDraft({
        storeId: "lidl",
        purchasedAt: "2026-10-02",
        lines: [
          { key: "a", productId: "penne", quantity: "3", unitPrice: "0,99" },
          { key: "b", productId: "deleted", quantity: "1", unitPrice: "1,00" },
        ],
        total: "",
        totalEdited: false,
      }),
    );
    renderForm();
    expect(await screen.findByRole("combobox", { name: "Magasin" })).toHaveTextContent("Lidl");
    expect(screen.getByLabelText("Quantité de Penne Rigate")).toHaveValue("3");
    expect(screen.getAllByRole("button", { name: /^Retirer/ })).toHaveLength(1);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-02");
  });

  it("opens normally when the saved draft is unreadable", async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{broken");
    renderForm();
    expect(await screen.findByText(/Aucun article pour l’instant/)).toBeInTheDocument();
  });

  it("sends the lines and clears the draft after saving", async () => {
    const props = renderForm();
    await chooseStore();
    await addPenne();
    await userEvent.click(screen.getByRole("button", { name: "Augmenter" }));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la course" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/purchases/p1"));
    const sent: FormData = props.action.mock.calls[0]?.[1];
    expect(sent.get("storeId")).toBe("lidl");
    expect(sent.get("purchasedAt")).toBe("2026-10-03");
    expect(sent.get("total")).toBe("1,98");
    expect(JSON.parse(sent.get("lines") as string)).toEqual([{ productId: "penne", quantity: 2, unitPriceCents: 99 }]);
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("creates a missing product with its price in the chosen store", async () => {
    const original = window.matchMedia;
    // Use the desktop dialog in jsdom.
    window.matchMedia = ((query: string) => ({ ...original(query), matches: true })) as typeof window.matchMedia;
    try {
      const createProduct = vi.fn().mockResolvedValue({ ok: true, data: riz });
      renderForm({ createProduct });
      await chooseStore();
      await userEvent.click(screen.getByRole("combobox", { name: "Ajouter un article" }));
      await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "Riz");
      await userEvent.click(screen.getByRole("option", { name: "Créer « Riz »" }));

      const dialog = await screen.findByRole("dialog", { name: "Nouveau produit" });
      await userEvent.type(within(dialog).getByLabelText("Contenance"), "1000");
      await userEvent.type(within(dialog).getByLabelText("Prix chez Lidl"), "2,79");
      await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

      expect(await screen.findByLabelText("Prix unitaire de Riz")).toHaveValue("2,79");
    } finally {
      window.matchMedia = original;
    }
  });
});
```

Run: `pnpm test src/components/purchases/purchase-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./purchase-form"`.

- [ ] **Step 4: Implement the purchase lines**

Create `src/components/purchases/purchase-lines.tsx`:

```tsx
"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEuros, parseEuros } from "@/domain/money";
import { lineSubtotal, parseQuantity } from "@/domain/purchase";
import { formatSize } from "@/lib/format";
import type { DraftLine } from "@/lib/purchase-draft";
import type { ProductSummary } from "@/server/repositories/products";
import { QuantityStepper } from "./quantity-stepper";

type Props = {
  lines: DraftLine[];
  productsById: Map<string, ProductSummary>;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
};

export function PurchaseLines({ lines, productsById, onChange, onRemove }: Props) {
  if (lines.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Aucun article pour l’instant. Cherche un produit ci-dessous pour l’ajouter.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-dashed rounded-md border bg-card">
      {lines.map((line) => {
        const product = productsById.get(line.productId);
        const name = product?.name ?? "Produit";
        const quantity = parseQuantity(line.quantity);
        const price = parseEuros(line.unitPrice);
        const priceId = `price-${line.key}`;
        return (
          <li
            key={line.key}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 lg:grid-cols-[1fr_auto_8rem_6rem_auto]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {product && (
                <p className="text-xs text-muted-foreground">
                  {[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 lg:order-last"
              aria-label={`Retirer ${name}`}
              onClick={() => onRemove(line.key)}
            >
              <Trash2 aria-hidden />
            </Button>
            <QuantityStepper
              id={`quantity-${line.key}`}
              label={`Quantité de ${name}`}
              value={line.quantity}
              onChange={(value) => onChange(line.key, { quantity: value })}
            />
            <div className="flex items-center gap-1.5">
              <label htmlFor={priceId} className="sr-only">
                {`Prix unitaire de ${name}`}
              </label>
              <Input
                id={priceId}
                inputMode="decimal"
                placeholder="Prix"
                className="font-mono"
                value={line.unitPrice}
                aria-invalid={price === null ? true : undefined}
                onChange={(event) => onChange(line.key, { unitPrice: event.target.value })}
              />
              <span className="text-sm text-muted-foreground">€</span>
            </div>
            <p className="col-span-2 text-right font-mono font-bold lg:col-span-1">
              {quantity !== null && price !== null ? formatEuros(lineSubtotal(quantity, price)) : "—"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Implement the purchase form**

Create `src/components/purchases/purchase-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { FieldError } from "@/components/common/field-error";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { ProductForm } from "@/components/products/product-form";
import { StoreForm } from "@/components/stores/store-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEuros, formatEurosInput, parseEuros } from "@/domain/money";
import { formatQuantity, parseQuantity, type PurchaseLine, stepQuantity, sumOfLines } from "@/domain/purchase";
import { formatSize } from "@/lib/format";
import {
  DRAFT_STORAGE_KEY,
  type DraftLine,
  isEmptyDraft,
  parseDraft,
  type PurchaseDraft,
  serializeDraft,
} from "@/lib/purchase-draft";
import { uploadUrl } from "@/lib/uploads";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";
import type { PriceIndex } from "@/server/repositories/purchases";
import type { StoreSummary } from "@/server/repositories/stores";
import { PurchaseLines } from "./purchase-lines";
import { ReceiptField } from "./receipt-field";

type Props = {
  mode: "create" | "edit";
  stores: StoreSummary[];
  products: ProductSummary[];
  priceIndex: PriceIndex;
  today: string;
  initial?: PurchaseDraft;
  receiptPath?: string | null;
  action: (prev: ActionState<{ id: string }>, formData: FormData) => Promise<ActionResult<{ id: string }>>;
  createStore: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  createProduct: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
};

const noSubscription = () => () => {};

/** The draft lives in localStorage, so the editor renders on the client only (no hydration mismatch). */
export function PurchaseForm(props: Props) {
  const isClient = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!isClient) return <p className="py-10 text-center text-muted-foreground">Chargement…</p>;
  return <PurchaseEditor {...props} />;
}

function emptyDraft(today: string): PurchaseDraft {
  return { storeId: null, purchasedAt: today, lines: [], total: "", totalEdited: false };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeDraft(draft: PurchaseDraft) {
  try {
    storage()?.setItem(DRAFT_STORAGE_KEY, serializeDraft(draft));
  } catch {
    // Storage full or blocked: the draft is a convenience, the form keeps working.
  }
}

function clearDraft() {
  try {
    storage()?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Same as above.
  }
}

/** crypto.randomUUID needs HTTPS; the app is served over plain HTTP on the private network. */
let keyCounter = 0;
function newLineKey(): string {
  keyCounter += 1;
  return `${Date.now().toString(36)}-${keyCounter}`;
}

function productLabel(product: ProductSummary): string {
  return [product.name, product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ");
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "fr");
}

function PurchaseEditor({
  mode,
  stores: initialStores,
  products: initialProducts,
  priceIndex,
  today,
  initial,
  receiptPath,
  action,
  createStore,
  createProduct,
}: Props) {
  const router = useRouter();
  const [stores, setStores] = useState(initialStores);
  const [products, setProducts] = useState(initialProducts);
  const [draft, setDraft] = useState<PurchaseDraft>(() => {
    if (initial) return initial;
    const restored = parseDraft(storage()?.getItem(DRAFT_STORAGE_KEY) ?? null, {
      storeIds: new Set(initialStores.map((store) => store.id)),
      productIds: new Set(initialProducts.map((product) => product.id)),
    });
    return restored && !isEmptyDraft(restored) ? restored : emptyDraft(today);
  });
  const [newStoreName, setNewStoreName] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "create") writeDraft(draft);
  }, [mode, draft]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const store = stores.find((candidate) => candidate.id === draft.storeId) ?? null;
  const lines = draft.lines.map((line) => ({
    productId: line.productId,
    quantity: parseQuantity(line.quantity),
    unitPriceCents: parseEuros(line.unitPrice),
  }));
  const sum = sumOfLines(lines.filter((line): line is PurchaseLine => line.quantity !== null && line.unitPriceCents !== null));
  const total = draft.totalEdited ? draft.total : sum > 0 ? formatEurosInput(sum) : "";

  const { state, errors, pending, onSubmit, formRef } = useFormAction(action, (saved) => {
    if (mode === "create") clearDraft();
    toast.success("Course enregistrée");
    router.push(`/purchases/${saved.id}`);
  });

  function currentPrice(storeId: string | null, productId: string): string {
    const cents = storeId ? priceIndex[storeId]?.[productId] : undefined;
    return cents ? formatEurosInput(cents) : "";
  }

  function chooseStore(storeId: string) {
    setDraft((current) => ({
      ...current,
      storeId,
      lines: current.lines.map((line) =>
        line.unitPrice.trim() ? line : { ...line, unitPrice: currentPrice(storeId, line.productId) },
      ),
    }));
  }

  function addProduct(productId: string, priceCents: number | null = null) {
    setDraft((current) => {
      const existing = current.lines.find((line) => line.productId === productId);
      if (existing) {
        const quantity = formatQuantity(stepQuantity(parseQuantity(existing.quantity) ?? 0, 1));
        return { ...current, lines: current.lines.map((line) => (line === existing ? { ...line, quantity } : line)) };
      }
      const unitPrice = priceCents ? formatEurosInput(priceCents) : currentPrice(current.storeId, productId);
      return { ...current, lines: [...current.lines, { key: newLineKey(), productId, quantity: "1", unitPrice }] };
    });
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function removeLine(key: string) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.key !== key) }));
  }

  return (
    <>
      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        className="grid gap-5 pb-28 lg:grid-cols-[1fr_20rem] lg:items-start lg:pb-0"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_10rem] gap-3">
            <EntityCombobox
              id="storeId"
              name="storeId"
              label="Magasin"
              placeholder="Choisir un magasin"
              options={stores.map((candidate) => ({
                id: candidate.id,
                label: candidate.name,
                imageUrl: candidate.logoPath ? uploadUrl(candidate.logoPath, { thumb: true }) : null,
              }))}
              value={draft.storeId}
              onChange={chooseStore}
              onCreate={setNewStoreName}
              errors={errors.storeId}
            />
            <div className="grid content-start gap-1.5">
              <Label htmlFor="purchasedAt">Date</Label>
              <Input
                id="purchasedAt"
                name="purchasedAt"
                type="date"
                className="font-mono"
                max={today}
                value={draft.purchasedAt}
                onChange={(event) => setDraft((current) => ({ ...current, purchasedAt: event.target.value }))}
                aria-invalid={errors.purchasedAt ? true : undefined}
                aria-describedby={errors.purchasedAt ? "purchasedAt-error" : undefined}
              />
              <FieldError id="purchasedAt-error" errors={errors.purchasedAt} />
            </div>
          </div>

          <section aria-labelledby="items-title" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 id="items-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Articles · {draft.lines.length}
              </h2>
              <span className="font-mono text-sm">{formatEuros(sum)}</span>
            </div>
            <PurchaseLines lines={draft.lines} productsById={productsById} onChange={updateLine} onRemove={removeLine} />
            <EntityCombobox
              id="productPicker"
              name="productPicker"
              label="Ajouter un article"
              placeholder="Rechercher un produit…"
              options={products.map((product) => ({
                id: product.id,
                label: productLabel(product),
                imageUrl: product.photoPath ? uploadUrl(product.photoPath, { thumb: true }) : null,
              }))}
              value={null}
              onChange={(productId) => addProduct(productId)}
              onCreate={setNewProductName}
            />
            <FieldError id="lines-error" errors={errors.lines} />
            <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          </section>
        </div>

        <aside className="grid gap-4 rounded-md border bg-card p-4 lg:sticky lg:top-4">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Somme des articles</span>
            <span className="font-mono">{formatEuros(sum)}</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="total">Total payé</Label>
            <Input
              id="total"
              name="total"
              inputMode="decimal"
              className="font-mono text-lg font-bold"
              value={total}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  total: event.target.value,
                  totalEdited: event.target.value.trim() !== "",
                }))
              }
              aria-invalid={errors.total ? true : undefined}
              aria-describedby={errors.total ? "total-error" : undefined}
            />
            <FieldError id="total-error" errors={errors.total} />
          </div>
          <ReceiptField name="receipt" currentPath={receiptPath} errors={errors.receipt} />
          {state && !state.ok && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <SubmitButton pending={pending}>
              {mode === "create" ? "Enregistrer la course" : "Enregistrer les modifications"}
            </SubmitButton>
          </div>
        </aside>
      </form>

      <ResponsiveDialog open={newStoreName !== null} onOpenChange={(open) => !open && setNewStoreName(null)} title="Nouveau magasin">
        {newStoreName !== null && (
          <StoreForm
            action={createStore}
            defaultName={newStoreName}
            onDone={(created) => {
              setStores((current) => [...current, created].sort(byName));
              chooseStore(created.id);
              setNewStoreName(null);
            }}
          />
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={newProductName !== null} onOpenChange={(open) => !open && setNewProductName(null)} title="Nouveau produit">
        {newProductName !== null && (
          <ProductForm
            action={createProduct}
            defaultName={newProductName}
            priceLabel={store ? `Prix chez ${store.name}` : "Prix"}
            onDone={(created, priceCents) => {
              setProducts((current) => [...current, created].sort(byName));
              addProduct(created.id, priceCents);
              setNewProductName(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </>
  );
}
```

The dialogs render outside the `<form>`, and `useFormAction` stops submit propagation (Task 6), so saving a store or product never submits the purchase.

- [ ] **Step 6: Run the form tests to see them pass**

Run: `pnpm test src/components/purchases/purchase-form.test.tsx`
Expected: PASS. If ESLint later flags `react-hooks/set-state-in-effect` or `react-hooks/purity`, note that the form sets state only in event handlers and the lazy initializer; keep that shape rather than moving the draft restore into an effect.

- [ ] **Step 7: Add the new purchase page**

Create `src/app/purchases/new/page.tsx`:

```tsx
import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { todayIso } from "@/lib/dates";
import { createProductAction } from "@/server/actions/products";
import { createPurchaseAction } from "@/server/actions/purchases";
import { createStoreAction } from "@/server/actions/stores";
import { listProducts } from "@/server/repositories/products";
import { latestPriceIndex } from "@/server/repositories/purchases";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Nouvelle course" };

export default async function NewPurchasePage() {
  const [stores, products, priceIndex] = await Promise.all([listStores(), listProducts(), latestPriceIndex()]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Nouvelle course</h1>
        <Link href="/purchases" aria-label="Fermer" className="grid size-11 place-items-center rounded-md border bg-card">
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      <PurchaseForm
        mode="create"
        stores={stores}
        products={products}
        priceIndex={priceIndex}
        today={todayIso()}
        action={createPurchaseAction}
        createStore={createStoreAction}
        createProduct={createProductAction}
      />
    </div>
  );
}
```

- [ ] **Step 8: Visual check, verify and commit**

Run `pnpm dev`, open `/purchases/new` at 375 px and 1280 px: pick a store, add two products (create one from the picker with its price), change a quantity, edit the total, reload the page (the draft comes back), then compare with mockup screen 2 (mobile and desktop) in `docs/mockups/`. Saving will land on a 404 until Task 8 adds the detail page.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add src/components src/app/purchases
git commit -m "feat(purchases): add the new purchase form with draft and inline creation"
```

---

### Task 8: Purchase history, detail, edit and delete

**Files:**
- Create: `src/components/purchases/purchase-history.tsx`, `src/components/purchases/purchase-actions.tsx`
- Create: `src/app/purchases/page.tsx`, `src/app/purchases/[id]/page.tsx`, `src/app/purchases/[id]/edit/page.tsx`
- Modify: `src/lib/format.ts`, `src/lib/purchase-draft.ts`
- Test: `src/lib/format.test.ts`, `src/lib/purchase-draft.test.ts`, `src/components/purchases/purchase-history.test.tsx`, `src/components/purchases/purchase-actions.test.tsx`

**Interfaces:**
- Consumes: `listPurchases`, `getPurchase`, `latestPriceIndex`, `PurchaseListItem`, `PurchaseDetail` (Task 3); `updatePurchaseAction`, `deletePurchaseAction` (Task 4); `groupByMonth`, `MonthGroup` (Task 2); `PurchaseForm` (Task 7); `runAction`, `EmptyState`, `uploadUrl`.
- Produces:
  - `formatDayLabel(date: Date): string` — `"Sam. 3 oct."` (UTC calendar day, capitalized).
  - `purchaseToDraft(purchase: PurchaseDetail): PurchaseDraft` — lines keyed by item id, quantities and prices formatted for inputs, `totalEdited: true`.
  - `<PurchaseHistory groups />` with `groups: MonthGroup<PurchaseListItem>[]` — receipt-style cards under `lg`, one table per month from `lg`.
  - `<PurchaseActions purchaseId />` — "Modifier" link and "Supprimer" button (confirmation, `runAction`, then back to `/purchases`).
  - Pages `/purchases`, `/purchases/[id]`, `/purchases/[id]/edit`; unknown or malformed ids show the root "Page introuvable".

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format.test.ts`:

```ts
describe("formatDayLabel", () => {
  it("names the day briefly, without shifting the date", () => {
    expect(formatDayLabel(new Date("2026-10-03T00:00:00.000Z"))).toBe("Sam. 3 oct.");
    expect(formatDayLabel(new Date("2026-09-30T00:00:00.000Z"))).toBe("Mer. 30 sept.");
  });
});
```

and add `formatDayLabel` to the import list of that file.

Append to `src/lib/purchase-draft.test.ts`:

```ts
describe("purchaseToDraft", () => {
  it("turns a saved purchase into editable values", () => {
    const purchase = {
      id: "p1",
      purchasedAt: new Date("2026-10-03T00:00:00.000Z"),
      totalCents: 497,
      receiptPath: null,
      store: { id: "lidl", name: "Lidl", address: null, logoPath: null },
      items: [
        {
          id: "i1",
          quantity: 1.2,
          unitPriceCents: 249,
          product: { id: "pommes", name: "Pommes", brand: null, photoPath: null, sizeValue: 1000, sizeUnit: "G" as const },
        },
      ],
    };
    expect(purchaseToDraft(purchase)).toEqual({
      storeId: "lidl",
      purchasedAt: "2026-10-03",
      lines: [{ key: "i1", productId: "pommes", quantity: "1,2", unitPrice: "2,49" }],
      total: "4,97",
      totalEdited: true,
    });
  });
});
```

and change that file's import to `import { isEmptyDraft, parseDraft, type PurchaseDraft, purchaseToDraft, serializeDraft } from "./purchase-draft";`.

Create `src/components/purchases/purchase-history.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupByMonth } from "@/lib/purchase-months";
import { PurchaseHistory } from "./purchase-history";

const lidl = { id: "lidl", name: "Lidl Lomme", address: null, logoPath: null };
const purchases = [
  { id: "p2", purchasedAt: new Date("2026-10-03T00:00:00.000Z"), totalCents: 4862, receiptPath: "receipts/a.webp", itemCount: 14, store: lidl },
  { id: "p1", purchasedAt: new Date("2026-09-30T00:00:00.000Z"), totalCents: 2790, receiptPath: null, itemCount: 1, store: lidl },
];
const plain = (s: string | null | undefined) => s?.replace(/[  ]/g, " ");

describe("PurchaseHistory", () => {
  it("shows each month with its total, newest first", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => plain(h.textContent));
    expect(headings).toEqual(["Octobre 2026 48,62 €", "Septembre 2026 27,90 €"]);
  });

  it("links each purchase card to its detail", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    const cards = screen.getByRole("list", { name: "Courses d’octobre 2026" });
    const link = within(cards).getByRole("link", { name: /Lidl Lomme/ });
    expect(link).toHaveAttribute("href", "/purchases/p2");
    expect(plain(link.textContent)).toContain("Sam. 3 oct. · 14 articles");
    expect(plain(link.textContent)).toContain("48,62 €");
  });

  it("names the month list in correct French", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    expect(screen.getByRole("list", { name: "Courses de septembre 2026" })).toBeInTheDocument();
  });

  it("says 1 article in the singular", () => {
    render(<PurchaseHistory groups={groupByMonth(purchases)} />);
    expect(screen.getAllByText(/1 article\b/).length).toBeGreaterThan(0);
  });
});
```

Create `src/components/purchases/purchase-actions.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseActions } from "./purchase-actions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const deletePurchaseAction = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/purchases", () => ({ deletePurchaseAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("PurchaseActions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("links to the edit page", () => {
    render(<PurchaseActions purchaseId="p1" />);
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/purchases/p1/edit");
  });

  it("deletes after confirmation and goes back to the history", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletePurchaseAction.mockResolvedValue({ ok: true, data: null });
    render(<PurchaseActions purchaseId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deletePurchaseAction).toHaveBeenCalledWith("p1");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/purchases"));
  });

  it("does nothing when the deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    deletePurchaseAction.mockClear();
    render(<PurchaseActions purchaseId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deletePurchaseAction).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm test src/lib src/components/purchases`
Expected: FAIL — missing `formatDayLabel`, `purchaseToDraft`, `./purchase-history`, `./purchase-actions`.

- [ ] **Step 2: Implement the helpers**

Append to `src/lib/format.ts`:

```ts
const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatDayLabel(date: Date): string {
  const label = dayLabel.format(date);
  return label.charAt(0).toLocaleUpperCase("fr-FR") + label.slice(1);
}
```

Append to `src/lib/purchase-draft.ts`:

```ts
import { formatEurosInput } from "@/domain/money";
import { formatQuantity } from "@/domain/purchase";
import type { PurchaseDetail } from "@/server/repositories/purchases";

export function purchaseToDraft(purchase: PurchaseDetail): PurchaseDraft {
  return {
    storeId: purchase.store.id,
    purchasedAt: purchase.purchasedAt.toISOString().slice(0, 10),
    lines: purchase.items.map((item) => ({
      key: item.id,
      productId: item.product.id,
      quantity: formatQuantity(item.quantity),
      unitPrice: formatEurosInput(item.unitPriceCents),
    })),
    total: formatEurosInput(purchase.totalCents),
    totalEdited: true,
  };
}
```

Move these three imports to the top of the file next to `import { z } from "zod";` (ESLint `import/first`). The `PurchaseDetail` import is type-only, so no server code reaches the client bundle.

- [ ] **Step 3: Implement the history and actions components**

Create `src/components/purchases/purchase-history.tsx`:

```tsx
import Link from "next/link";
import { formatEuros } from "@/domain/money";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import type { MonthGroup } from "@/lib/purchase-months";
import { uploadUrl } from "@/lib/uploads";
import type { PurchaseListItem } from "@/server/repositories/purchases";

function articles(count: number): string {
  return `${count} ${count > 1 ? "articles" : "article"}`;
}

function StoreLogo({ store }: { store: PurchaseListItem["store"] }) {
  return (
    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-sm font-bold text-primary">
      {store.logoPath ? <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" /> : store.name[0]}
    </div>
  );
}

export function PurchaseHistory({ groups }: { groups: MonthGroup<PurchaseListItem>[] }) {
  return (
    <div className="grid gap-6">
      {groups.map((group) => {
        const month = group.label.toLocaleLowerCase("fr-FR");
        const listLabel = `Courses ${/^[aeiouy]/.test(month) ? "d’" : "de "}${month}`;
        return (
          <section key={group.month} aria-labelledby={`month-${group.month}`} className="grid gap-2">
            <h2
              id={`month-${group.month}`}
              className="flex justify-between font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              <span>{group.label}</span> <span className="font-mono">{formatEuros(group.totalCents)}</span>
            </h2>

            <ul aria-label={listLabel} className="grid gap-3 lg:hidden">
              {group.purchases.map((purchase) => (
                <li key={purchase.id}>
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="receipt-edge flex items-center gap-3 rounded-md border bg-card px-3 py-3 active:scale-[0.99]"
                  >
                    <StoreLogo store={purchase.store} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{purchase.store.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDayLabel(purchase.purchasedAt)} · {articles(purchase.itemCount)}
                      </span>
                    </span>
                    <span className="font-mono font-bold">{formatEuros(purchase.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <table className="hidden w-full overflow-hidden rounded-md border bg-card text-sm lg:table">
              <thead>
                <tr className="text-left text-xs tracking-wider text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Magasin</th>
                  <th className="px-3 py-2 text-right font-semibold">Articles</th>
                  <th className="px-3 py-2 font-semibold">Ticket</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed">
                {group.purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-secondary/50">
                    <td className="px-3 py-2.5 font-mono">{formatShortDate(purchase.purchasedAt)}</td>
                    <td className="px-3">
                      <Link href={`/purchases/${purchase.id}`} className="font-semibold hover:underline">
                        {purchase.store.name}
                      </Link>
                    </td>
                    <td className="px-3 text-right font-mono">{purchase.itemCount}</td>
                    <td className="px-3">
                      {purchase.receiptPath ? (
                        <a href={uploadUrl(purchase.receiptPath)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Voir
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 text-right font-mono font-bold">{formatEuros(purchase.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
```

Create `src/components/purchases/purchase-actions.tsx`:

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runAction } from "@/components/common/run-action";
import { Button } from "@/components/ui/button";
import { deletePurchaseAction } from "@/server/actions/purchases";

export function PurchaseActions({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();

  async function remove() {
    if (!window.confirm("Supprimer cette course ? Ses prix seront aussi retirés des produits.")) return;
    if (await runAction(deletePurchaseAction(purchaseId), "Course supprimée")) router.push("/purchases");
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="h-11" asChild>
        <Link href={`/purchases/${purchaseId}/edit`}>
          <Pencil aria-hidden /> Modifier
        </Link>
      </Button>
      <Button variant="outline" className="h-11 text-destructive" onClick={remove}>
        <Trash2 aria-hidden /> Supprimer
      </Button>
    </div>
  );
}
```

Run: `pnpm test src/lib src/components/purchases`
Expected: PASS.

- [ ] **Step 4: Build the pages**

Create `src/app/purchases/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PurchaseHistory } from "@/components/purchases/purchase-history";
import { Button } from "@/components/ui/button";
import { groupByMonth } from "@/lib/purchase-months";
import { listPurchases } from "@/server/repositories/purchases";

export const metadata: Metadata = { title: "Courses" };

export default async function PurchasesPage() {
  const groups = groupByMonth(await listPurchases());

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">Courses</h1>
        <Button asChild className="h-11">
          <Link href="/purchases/new">Nouvelle course</Link>
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          title="Aucune course"
          description="Enregistre ta première course en rentrant du magasin."
          action={
            <Button asChild>
              <Link href="/purchases/new">Enregistrer une course</Link>
            </Button>
          }
        />
      ) : (
        <PurchaseHistory groups={groups} />
      )}
    </div>
  );
}
```

Create `src/app/purchases/[id]/page.tsx`:

```tsx
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseActions } from "@/components/purchases/purchase-actions";
import { formatEuros } from "@/domain/money";
import { formatQuantity, lineSubtotal, sumOfLines } from "@/domain/purchase";
import { formatLongDate, formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { getPurchase } from "@/server/repositories/purchases";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const purchase = await getPurchase((await params).id);
  return { title: purchase ? `Course chez ${purchase.store.name}` : "Course" };
}

export default async function PurchasePage({ params }: Props) {
  const purchase = await getPurchase((await params).id);
  if (!purchase) notFound();
  const sum = sumOfLines(purchase.items);
  const gap = purchase.totalCents - sum;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/purchases" className="flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Courses
        </Link>
        <PurchaseActions purchaseId={purchase.id} />
      </div>

      <div>
        <h1 className="text-2xl">{purchase.store.name}</h1>
        <p className="text-muted-foreground first-letter:uppercase">{formatLongDate(purchase.purchasedAt)}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_16rem] lg:items-start">
        <section aria-labelledby="lines-title" className="grid gap-2">
          <h2 id="lines-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Articles · {purchase.items.length}
          </h2>
          <ul className="receipt-edge divide-y divide-dashed rounded-md border bg-card">
            {purchase.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${item.product.id}`} className="font-medium hover:underline">
                    {item.product.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatQuantity(item.quantity)} × {formatEuros(item.unitPriceCents)} ·{" "}
                    {formatSize(item.product.sizeValue, item.product.sizeUnit)}
                  </p>
                </div>
                <span className="font-mono font-bold">{formatEuros(lineSubtotal(item.quantity, item.unitPriceCents))}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-1 rounded-md border bg-card p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Somme des articles</dt>
              <dd className="font-mono">{formatEuros(sum)}</dd>
            </div>
            {gap !== 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Écart (remises, oublis)</dt>
                <dd className="font-mono">{formatEuros(gap)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total payé</dt>
              <dd className="font-mono">{formatEuros(purchase.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="receipt-title" className="grid gap-2">
          <h2 id="receipt-title" className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Ticket
          </h2>
          {purchase.receiptPath ? (
            <a href={uploadUrl(purchase.receiptPath)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
              <img src={uploadUrl(purchase.receiptPath, { thumb: true })} alt="Ticket de caisse (agrandir)" className="w-full object-cover" />
            </a>
          ) : (
            <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">Pas de photo du ticket.</p>
          )}
        </section>
      </div>
    </div>
  );
}
```

Tapping the receipt opens the full-size image in a new tab (spec §6.5 "tap to enlarge"): the browser's own viewer gives pinch-zoom for free.

Create `src/app/purchases/[id]/edit/page.tsx`:

```tsx
import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { todayIso } from "@/lib/dates";
import { purchaseToDraft } from "@/lib/purchase-draft";
import { createProductAction } from "@/server/actions/products";
import { updatePurchaseAction } from "@/server/actions/purchases";
import { createStoreAction } from "@/server/actions/stores";
import { listProducts } from "@/server/repositories/products";
import { getPurchase, latestPriceIndex } from "@/server/repositories/purchases";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Modifier la course" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [purchase, stores, products, priceIndex] = await Promise.all([
    getPurchase(id),
    listStores(),
    listProducts(),
    latestPriceIndex(),
  ]);
  if (!purchase) notFound();

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Modifier la course</h1>
        <Link href={`/purchases/${id}`} aria-label="Fermer" className="grid size-11 place-items-center rounded-md border bg-card">
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      <PurchaseForm
        mode="edit"
        stores={stores}
        products={products}
        priceIndex={priceIndex}
        today={todayIso()}
        initial={purchaseToDraft(purchase)}
        receiptPath={purchase.receiptPath}
        action={updatePurchaseAction.bind(null, id)}
        createStore={createStoreAction}
        createProduct={createProductAction}
      />
    </div>
  );
}
```

- [ ] **Step 5: Visual check, verify and commit**

Run `pnpm dev`: save a purchase from `/purchases/new` (lands on its detail), open `/purchases` at 375 px and 1280 px (cards on mobile, tables on desktop), edit the purchase (change a price and the store), check the product page shows the new price only, then delete the purchase. Compare with mockup screen 5 (mobile and desktop).

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add src/lib src/components/purchases src/app/purchases
git commit -m "feat(purchases): add purchase history, detail, edit and delete"
```

---

### Task 9: End-to-end purchase flow

**Files:**
- Create: `tests/e2e/purchase.spec.ts`
- Modify: `docs/superpowers/plans/2026-10-03-cabas-roadmap.md` (link Plan 2)

**Interfaces:**
- Consumes: the whole feature (Tasks 1–8) through the browser.
- Produces: `pnpm test:e2e` covers spec E2E flow 1 ("record a purchase while creating a store and a product") on the mobile and desktop projects, plus draft restore and deletion.

- [ ] **Step 1: Write the end-to-end test**

Create `tests/e2e/purchase.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("record a purchase while creating a store and a product, then delete it", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  const store = `Leclerc ${suffix}`;
  const product = `Lentilles ${suffix}`;
  const receipt = await sharp({ create: { width: 900, height: 2400, channels: 3, background: "#fff" } }).jpeg().toBuffer();

  await page.goto("/purchases/new");

  await page.getByRole("combobox", { name: "Magasin" }).click();
  await page.getByPlaceholder("Rechercher…").fill(store);
  await page.getByRole("option", { name: `Créer « ${store} »` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);

  await page.getByRole("combobox", { name: "Ajouter un article" }).click();
  await page.getByPlaceholder("Rechercher…").fill(product);
  await page.getByRole("option", { name: `Créer « ${product} »` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contenance").fill("500");
  await dialog.getByLabel(`Prix chez ${store}`).fill("1,49");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByLabel(`Prix unitaire de ${product}`)).toHaveValue("1,49");

  await page.getByRole("button", { name: "Augmenter" }).click();
  await expect(page.getByLabel("Total payé")).toHaveValue("2,98");

  // The draft survives a reload (phone call, accidental refresh).
  await page.reload();
  await expect(page.getByLabel(`Quantité de ${product}`)).toHaveValue("2");
  await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);

  await page.getByLabel(/Photo du ticket/).setInputFiles({ name: "ticket.jpg", mimeType: "image/jpeg", buffer: receipt });
  await page.getByRole("button", { name: "Enregistrer la course" }).click();

  await expect(page.getByRole("heading", { level: 1, name: store })).toBeVisible();
  await expect(page.getByText(/2,98\s€/).last()).toBeVisible();
  await expect(page.getByRole("img", { name: /Ticket de caisse/ })).toBeVisible();
  const detailUrl = page.url();

  await page.goto("/purchases");
  await expect(page.getByRole("link", { name: new RegExp(store) }).first()).toBeVisible();

  await page.goto(`/products?q=${encodeURIComponent(product)}`);
  await page.getByRole("link", { name: new RegExp(product) }).click();
  await expect(page.getByRole("row").filter({ hasText: store })).toContainText("1,49");
  const productUrl = page.url();

  await page.goto(detailUrl);
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page).toHaveURL(/\/purchases$/);

  await page.goto(productUrl);
  await expect(page.getByText("Aucun prix relevé pour ce produit.")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e`
Expected: PASS on `mobile` and `desktop` for both `catalog.spec.ts` and `purchase.spec.ts` (6 tests). If a step fails, read the trace (`pnpm exec playwright show-trace test-results/…/trace.zip`) and fix the app unless the test contradicts the spec.

- [ ] **Step 3: Link the plan from the roadmap and commit**

In `docs/superpowers/plans/2026-10-03-cabas-roadmap.md`, replace `| 2 | Purchases |` with `| 2 | [Purchases](2026-10-04-cabas-plan-2-purchases.md) |`.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all pass.

```bash
git add tests/e2e/purchase.spec.ts docs/superpowers/plans/2026-10-03-cabas-roadmap.md
git commit -m "test(e2e): cover recording, restoring and deleting a purchase"
```

---

## Plan completion checklist

- [ ] All 9 tasks committed on `feat/purchases`; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green.
- [ ] `docker build -t cabas:latest .` succeeds and a fresh `docker compose` stack applies the `purchases` migration at start.
- [ ] Whole-branch review done and its Critical/Important findings fixed with tests.
- [ ] Pull request opened against `main` (Conventional Commit title, no AI mention), then Plan 3 (shopping lists) is written against the merged code.
