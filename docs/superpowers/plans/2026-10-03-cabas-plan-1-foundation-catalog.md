# cabas Plan 1 — Foundation & catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable cabas with its Docker stack, app shell and "Ticket de caisse" theme, and a working catalog: stores, products, manual prices, per-store price comparison and alternatives.

**Architecture:** One Next.js 16 App Router app. Pure business rules live in `src/domain/` (no framework imports). `src/server/` holds Prisma repositories, image storage and Server Actions, which validate with Zod and return a typed `ActionResult`. Pages in `src/app/` are thin Server Components composing feature components from `src/components/`.

**Tech Stack:** Node 24, pnpm 10, Next.js 16, React 19.2, TypeScript strict, PostgreSQL 18, Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`), Tailwind CSS 4, shadcn/ui, Zod 4, sharp, Vitest + Testing Library + Testcontainers, Playwright, Docker.

**Spec:** [`docs/superpowers/specs/2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md). Roadmap: [`2026-10-03-cabas-roadmap.md`](2026-10-03-cabas-roadmap.md). Read `CLAUDE.md` and `docs/best-practices.md` before starting.

## Global Constraints

- pnpm only (`packageManager: pnpm@10`), never npm or yarn.
- TDD for every behavior: failing test first, then minimal code, then refactor.
- Money is stored and computed as integer cents; euros only at display time (`fr-FR`, `EUR`).
- Product sizes are stored in base units: `G`, `ML`, `PIECE`.
- UI copy is French; code, comments and docs are English.
- IDs are UUIDv7 (`@default(uuid(7))`); every model has `createdAt` and `updatedAt`.
- Mobile first; the desktop layout starts at `lg` (1024 px). Touch targets ≥ 44 px; inputs ≥ 16 px font.
- Theme "Ticket de caisse": background `#FBF7F0`, ink `#1C1917`, primary `#C2410C`, savings green `#166534`, radius 6 px, Fraunces (headings), Inter (text), JetBrains Mono (prices and quantities).
- Images: JPEG, PNG or WebP, ≤ 10 MB, re-encoded to WebP plus a 300 px thumbnail.
- Conventional Commits, English, no mention of Claude or AI anywhere.
- `pnpm lint && pnpm typecheck && pnpm test` pass before every commit.
- Every task that creates or changes a screen ends with a visual check shown to the user before committing: run `pnpm dev`, open the page in the browser pane at 375 px and 1280 px wide, compare it with `docs/mockups/02-mobile-screens.html` and `03-desktop-screens.html`, and wait for the user's go-ahead.

## Review Focus

1. **Comma decimals and stray characters in prices** ("1,29", "1.29", "1,29 €", " 2 "): all must parse to cents; "abc", "0", "-1" and "1,999" must be rejected with a French message. Pinned in Task 1.
2. **Duplicate store names differing only by case or spaces** ("Lidl Lomme" vs " lidl lomme"): creation must fail with "Ce magasin existe déjà" instead of a raw database error. Pinned in Task 8.
3. **Path traversal on `/uploads/...`** (`../.env`, encoded `%2e%2e`): must answer 404, never read outside the uploads directory. Pinned in Task 6.
4. **Non-image or oversized uploads** (a PDF renamed `.jpg`, a 12 MB photo): rejected with a French error on the photo field, no record is created, and the typed values stay in the form so it saves once the photo is removed. Pinned in Tasks 6 and 8.
5. **Same price observed twice on the same day in one store**: the latest entry (by `createdAt`) wins and no store appears twice in the price list. Pinned in Task 3.

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.json, next.config.ts, eslint.config.mjs
vitest.config.mts, playwright.config.ts, prisma.config.ts, components.json
Dockerfile, docker-compose.yml, docker-compose.dev.yml, docker-entrypoint.sh, .dockerignore, .env.example
prisma/schema.prisma, prisma/migrations/
src/
  domain/
    types.ts                 # SizeUnit, shared domain types
    money.ts                 # parseEuros, formatEuros
    unit-price.ts            # pricePerMeasure, measureLabel, areComparable
    latest-prices.ts         # latestPricesByStore, cheapestStorePrice
    alternatives.ts          # rankAlternatives
  lib/
    env.ts                   # getEnv (Zod-validated environment)
    format.ts                # formatPriceAge, formatSize, formatPerMeasure
    utils.ts                 # cn (shadcn)
  generated/prisma/          # Prisma client (git-ignored)
  server/
    db.ts                    # Prisma singleton
    storage/images.ts        # saveImage, deleteImage, resolveUploadPath
    actions/result.ts        # ActionResult, fieldErrors helpers
    actions/stores.ts, stores.schema.ts
    actions/products.ts, products.schema.ts
    actions/prices.ts, prices.schema.ts
    actions/alternatives.ts
    repositories/stores.ts, products.ts, prices.ts, alternatives.ts
  components/
    ui/                      # shadcn primitives
    layout/app-nav.tsx       # bottom bar (mobile) + sidebar (desktop)
    common/responsive-dialog.tsx, entity-combobox.tsx, image-field.tsx, submit-button.tsx, empty-state.tsx
    stores/store-form.tsx, store-list.tsx
    products/product-form.tsx, product-card.tsx, price-table.tsx, price-form.tsx, alternatives-carousel.tsx, add-alternative.tsx
  app/
    layout.tsx, globals.css, page.tsx, error.tsx, not-found.tsx
    stores/page.tsx
    products/page.tsx, products/[id]/page.tsx, products/[id]/error.tsx
    uploads/[...path]/route.ts
tests/
  setup/integration-global.ts, integration.ts, components.ts
  e2e/catalog.spec.ts
```

---

### Task 1: Project scaffold and money rules

**Files:**
- Create: Next.js scaffold files, `pnpm-workspace.yaml`, `vitest.config.mts`
- Create: `src/domain/types.ts`, `src/domain/money.ts`
- Test: `src/domain/money.test.ts`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`, `CLAUDE.md` (Commands section if script names differ)

**Interfaces:**
- Produces: `parseEuros(input: string): number | null` (cents, `null` when invalid or ≤ 0); `formatEuros(cents: number): string` (e.g. `"1,29 €"` with the narrow no-break space that `Intl` emits); `type SizeUnit = "G" | "ML" | "PIECE"`.

- [ ] **Step 1: Scaffold Next.js in a temporary folder and merge it in**

The repo already holds `CLAUDE.md`, `docs/` and `.gitignore`, so scaffold elsewhere and copy:

```bash
pnpm create next-app@latest ../cabas-scaffold --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --skip-install --yes
rsync -a --exclude .git --exclude .gitignore --exclude README.md ../cabas-scaffold/ ./
rm -rf ../cabas-scaffold
corepack enable
pnpm install
```

Then pin the package manager (use the exact version printed by `pnpm -v`):

```bash
npm pkg set packageManager="pnpm@$(pnpm -v)"
```

- [ ] **Step 2: Harden TypeScript and scripts**

In `tsconfig.json` `compilerOptions`, keep `"strict": true` and add:

```json
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true
```

Set the scripts in `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

Create `pnpm-workspace.yaml` (allows the build scripts pnpm 10 blocks by default):

```yaml
onlyBuiltDependencies:
  - "@prisma/engines"
  - prisma
  - sharp
  - esbuild
  - unrs-resolver
```

- [ ] **Step 3: Install Vitest and configure the unit project**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom
```

Create `vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/domain/**/*.test.ts", "src/lib/**/*.test.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Write the failing money tests**

Create `src/domain/types.ts`:

```ts
export type SizeUnit = "G" | "ML" | "PIECE";
```

Create `src/domain/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEuros, parseEuros } from "./money";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("parseEuros", () => {
  it.each([
    ["1,29", 129],
    ["1.29", 129],
    ["1,29 €", 129],
    ["€1.29", 129],
    [" 2 ", 200],
    ["0,5", 50],
    ["12", 1200],
    ["1 234,56", 123456],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseEuros(input)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "-1", "1,999", "1,2,3", "1e3"])(
    "rejects %j",
    (input) => {
      expect(parseEuros(input)).toBeNull();
    },
  );
});

describe("formatEuros", () => {
  it("formats cents as French euros", () => {
    expect(plain(formatEuros(129))).toBe("1,29 €");
    expect(plain(formatEuros(123456))).toBe("1 234,56 €");
    expect(plain(formatEuros(0))).toBe("0,00 €");
  });
});
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `pnpm test`
Expected: FAIL, `Cannot find module './money'` (or "does not provide an export").

- [ ] **Step 6: Implement money rules**

Create `src/domain/money.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm test`
Expected: PASS (all `parseEuros` and `formatEuros` cases).

- [ ] **Step 8: Verify the scaffold and commit**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all succeed.

```bash
git add -A
git commit -m "chore: scaffold next.js app with vitest and money rules"
```

---

### Task 2: Price per unit of measure and display formatting

**Files:**
- Create: `src/domain/unit-price.ts`, `src/lib/format.ts`
- Test: `src/domain/unit-price.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `SizeUnit` (`src/domain/types.ts`), `formatEuros` (`src/domain/money.ts`).
- Produces:
  - `pricePerMeasure(priceCents: number, sizeValue: number, sizeUnit: SizeUnit): number` — unrounded cents per kg, per L or per piece; throws `RangeError` when `sizeValue <= 0`.
  - `measureLabel(unit: SizeUnit): "kg" | "L" | "pièce"`
  - `areComparable(a: { sizeUnit: SizeUnit }, b: { sizeUnit: SizeUnit }): boolean`
  - `formatPerMeasure(priceCents: number, sizeValue: number, sizeUnit: SizeUnit): string` — e.g. `"1,98 €/kg"`.
  - `formatSize(sizeValue: number, sizeUnit: SizeUnit): string` — `"500 g"`, `"1 kg"`, `"1,5 L"`, `"12 pièces"`.
  - `formatPriceAge(observedAt: Date, now: Date): string` — `"aujourd'hui"`, `"hier"`, `"il y a 3 j"`, `"il y a 2 mois"`, `"il y a 1 an"`.

- [ ] **Step 1: Write the failing unit price tests**

Create `src/domain/unit-price.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { areComparable, measureLabel, pricePerMeasure } from "./unit-price";

describe("pricePerMeasure", () => {
  it("computes the price per kilo of a 500 g product", () => {
    expect(pricePerMeasure(99, 500, "G")).toBe(198);
  });
  it("computes the price per litre of a 1 L product", () => {
    expect(pricePerMeasure(109, 1000, "ML")).toBe(109);
  });
  it("computes the price per piece of a pack of 12", () => {
    expect(pricePerMeasure(315, 12, "PIECE")).toBe(26.25);
  });
  it("rejects a non-positive size", () => {
    expect(() => pricePerMeasure(100, 0, "G")).toThrow(RangeError);
  });
});

describe("measureLabel", () => {
  it("names the measure of each unit", () => {
    expect(measureLabel("G")).toBe("kg");
    expect(measureLabel("ML")).toBe("L");
    expect(measureLabel("PIECE")).toBe("pièce");
  });
});

describe("areComparable", () => {
  it("compares products only when they share a unit", () => {
    expect(areComparable({ sizeUnit: "G" }, { sizeUnit: "G" })).toBe(true);
    expect(areComparable({ sizeUnit: "G" }, { sizeUnit: "PIECE" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test src/domain/unit-price.test.ts`
Expected: FAIL, cannot resolve `./unit-price`.

- [ ] **Step 3: Implement unit price rules**

Create `src/domain/unit-price.ts`:

```ts
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
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test src/domain/unit-price.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing format tests**

Create `src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPerMeasure, formatPriceAge, formatSize } from "./format";

const plain = (s: string) => s.replace(/[  ]/g, " ");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("formatPerMeasure", () => {
  it("shows the rounded price per kilo", () => {
    expect(plain(formatPerMeasure(99, 500, "G"))).toBe("1,98 €/kg");
  });
  it("shows the price per piece", () => {
    expect(plain(formatPerMeasure(315, 12, "PIECE"))).toBe("0,26 €/pièce");
  });
});

describe("formatSize", () => {
  it.each([
    [500, "G", "500 g"],
    [1000, "G", "1 kg"],
    [1500, "G", "1,5 kg"],
    [750, "ML", "750 ml"],
    [1500, "ML", "1,5 L"],
    [1, "PIECE", "1 pièce"],
    [12, "PIECE", "12 pièces"],
  ] as const)("formats %i %s as %j", (value, unit, expected) => {
    expect(plain(formatSize(value, unit))).toBe(expected);
  });
});

describe("formatPriceAge", () => {
  const now = new Date("2026-10-03T15:30:00.000Z");
  it.each([
    ["2026-10-03", "aujourd'hui"],
    ["2026-10-02", "hier"],
    ["2026-09-30", "il y a 3 j"],
    ["2026-08-01", "il y a 2 mois"],
    ["2025-09-01", "il y a 1 an"],
    ["2023-01-01", "il y a 3 ans"],
  ])("describes a price observed on %s as %j", (iso, expected) => {
    expect(formatPriceAge(day(iso), now)).toBe(expected);
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run: `pnpm test src/lib/format.test.ts`
Expected: FAIL, cannot resolve `./format`.

- [ ] **Step 7: Implement the formatters**

Create `src/lib/format.ts`:

```ts
import { formatEuros } from "@/domain/money";
import type { SizeUnit } from "@/domain/types";
import { measureLabel, pricePerMeasure } from "@/domain/unit-price";

const DAY_MS = 86_400_000;
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
```

- [ ] **Step 8: Run to see it pass**

Run: `pnpm test`
Expected: PASS (money, unit-price, format).

- [ ] **Step 9: Commit**

```bash
git add src/domain/unit-price.ts src/domain/unit-price.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(domain): add price per unit of measure and display formatters"
```

---

### Task 3: Latest price per store and cheapest store

**Files:**
- Create: `src/domain/latest-prices.ts`
- Test: `src/domain/latest-prices.test.ts`

**Interfaces:**
- Produces:
  - `type PriceObservationInput = { storeId: string; priceCents: number; observedAt: Date; createdAt: Date }`
  - `type StorePrice = { storeId: string; priceCents: number; observedAt: Date }`
  - `latestPricesByStore(observations: PriceObservationInput[]): StorePrice[]` — one entry per store (latest `observedAt`, ties broken by latest `createdAt`), sorted by `priceCents` ascending, then most recent `observedAt` first.
  - `cheapestStorePrice(prices: StorePrice[]): StorePrice | null`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/latest-prices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cheapestStorePrice, latestPricesByStore, type PriceObservationInput } from "./latest-prices";

const obs = (
  storeId: string,
  priceCents: number,
  observedAt: string,
  createdAt = `${observedAt}T12:00:00Z`,
): PriceObservationInput => ({
  storeId,
  priceCents,
  observedAt: new Date(`${observedAt}T00:00:00Z`),
  createdAt: new Date(createdAt),
});

describe("latestPricesByStore", () => {
  it("keeps only the most recent observation of each store", () => {
    const result = latestPricesByStore([
      obs("lidl", 89, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("leclerc", 115, "2026-09-20"),
    ]);
    expect(result.map((p) => [p.storeId, p.priceCents])).toEqual([
      ["lidl", 99],
      ["leclerc", 115],
    ]);
  });

  it("breaks a same-day tie with the latest entry", () => {
    const result = latestPricesByStore([
      obs("lidl", 99, "2026-10-01", "2026-10-01T09:00:00Z"),
      obs("lidl", 95, "2026-10-01", "2026-10-01T18:00:00Z"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.priceCents).toBe(95);
  });

  it("sorts stores from cheapest to most expensive", () => {
    const result = latestPricesByStore([
      obs("auchan", 129, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("leclerc", 115, "2026-09-20"),
    ]);
    expect(result.map((p) => p.storeId)).toEqual(["lidl", "leclerc", "auchan"]);
  });

  it("returns nothing when there is no observation", () => {
    expect(latestPricesByStore([])).toEqual([]);
  });
});

describe("cheapestStorePrice", () => {
  it("returns the lowest price, preferring the most recent on a tie", () => {
    const prices = latestPricesByStore([
      obs("leclerc", 99, "2026-09-01"),
      obs("lidl", 99, "2026-10-01"),
      obs("auchan", 129, "2026-10-02"),
    ]);
    expect(cheapestStorePrice(prices)?.storeId).toBe("lidl");
  });

  it("returns null without prices", () => {
    expect(cheapestStorePrice([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test src/domain/latest-prices.test.ts`
Expected: FAIL, cannot resolve `./latest-prices`.

- [ ] **Step 3: Implement**

Create `src/domain/latest-prices.ts`:

```ts
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
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test src/domain/latest-prices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/latest-prices.ts src/domain/latest-prices.test.ts
git commit -m "feat(domain): compute latest price per store and cheapest store"
```

---

### Task 4: Alternatives ranking

**Files:**
- Create: `src/domain/alternatives.ts`
- Test: `src/domain/alternatives.test.ts`

**Interfaces:**
- Consumes: `pricePerMeasure`, `areComparable` (Task 2).
- Produces:
  - `type ProductPricing = { id: string; sizeValue: number; sizeUnit: SizeUnit; bestPriceCents: number | null }`
  - `type RankedAlternative = ProductPricing & { perMeasureCents: number | null; discountPercent: number | null }`
  - `rankAlternatives(current: ProductPricing, alternatives: ProductPricing[]): RankedAlternative[]` — order: comparable priced alternatives by price per unit ascending, then non-comparable priced ones by price per unit ascending, then unpriced ones. `discountPercent` is a positive whole number (20 means "−20 %") only when the alternative is comparable, both are priced, and the alternative is cheaper per unit by at least 1 % after rounding.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/alternatives.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rankAlternatives, type ProductPricing } from "./alternatives";

const penne: ProductPricing = { id: "penne", sizeValue: 500, sizeUnit: "G", bestPriceCents: 99 };
const combino: ProductPricing = { id: "combino", sizeValue: 1000, sizeUnit: "G", bestPriceCents: 158 };
const panzani: ProductPricing = { id: "panzani", sizeValue: 500, sizeUnit: "G", bestPriceCents: 105 };
const gnocchi: ProductPricing = { id: "gnocchi", sizeValue: 12, sizeUnit: "PIECE", bestPriceCents: 300 };
const fresh: ProductPricing = { id: "fresh", sizeValue: 400, sizeUnit: "G", bestPriceCents: null };

describe("rankAlternatives", () => {
  it("puts comparable alternatives first, cheapest per unit first, then other units, then unpriced", () => {
    const ranked = rankAlternatives(penne, [fresh, gnocchi, panzani, combino]);
    expect(ranked.map((a) => a.id)).toEqual(["combino", "panzani", "gnocchi", "fresh"]);
  });

  it("shows the per-unit discount of a cheaper comparable alternative", () => {
    const [first] = rankAlternatives(penne, [combino]);
    expect(first?.perMeasureCents).toBe(158);
    expect(first?.discountPercent).toBe(20);
  });

  it("shows no discount for a more expensive alternative", () => {
    expect(rankAlternatives(penne, [panzani])[0]?.discountPercent).toBeNull();
  });

  it("shows no discount across different units", () => {
    expect(rankAlternatives(penne, [gnocchi])[0]?.discountPercent).toBeNull();
  });

  it("shows no discount when the current product has no price", () => {
    const unpriced = { ...penne, bestPriceCents: null };
    expect(rankAlternatives(unpriced, [combino])[0]?.discountPercent).toBeNull();
  });

  it("gives an unpriced alternative no price per unit", () => {
    expect(rankAlternatives(penne, [fresh])[0]?.perMeasureCents).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test src/domain/alternatives.test.ts`
Expected: FAIL, cannot resolve `./alternatives`.

- [ ] **Step 3: Implement**

Create `src/domain/alternatives.ts`:

```ts
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
```

- [ ] **Step 4: Run to see it pass**

Run: `pnpm test src/domain/alternatives.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/alternatives.ts src/domain/alternatives.test.ts
git commit -m "feat(domain): rank alternatives by price per unit with discount badge"
```

---

### Task 5: Database, environment and integration test harness

**Files:**
- Create: `docker-compose.dev.yml`, `.env.example`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/*` (generated)
- Create: `src/lib/env.ts`, `src/server/db.ts`
- Create: `tests/setup/empty.ts`, `tests/setup/integration-global.ts`, `tests/setup/integration.ts`
- Modify: `vitest.config.mts`, `.gitignore`
- Test: `src/lib/env.test.ts`, `src/server/db.test.ts`

**Interfaces:**
- Produces:
  - `parseEnv(source: Record<string, string | undefined>): Env` and `getEnv(): Env`, with `type Env = { DATABASE_URL: string; UPLOADS_DIR: string }` (`UPLOADS_DIR` defaults to `"./uploads"`).
  - `db(): PrismaClient` — lazily created singleton (never at import time, so `next build` works without a database).
  - Prisma models `Store`, `Product`, `PriceObservation`, `ProductAlternative`; enums `SizeUnit` (`G | ML | PIECE`) and `PriceSource` (`PURCHASE | MANUAL`). Import types from `@/generated/prisma/client`.
  - Integration harness: any `src/server/**/*.test.ts` runs against a fresh PostgreSQL 18 container with migrations applied; all tables are truncated before each test; `next/cache` is mocked; `UPLOADS_DIR` points to a temporary directory.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @prisma/client@7 @prisma/adapter-pg pg dotenv zod server-only
pnpm add -D prisma@7 @types/pg @testcontainers/postgresql
```

- [ ] **Step 2: Add the local database and environment template**

Create `docker-compose.dev.yml`:

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - pgdata-dev:/var/lib/postgresql
volumes:
  pgdata-dev:
```

Create `.env.example`:

```dotenv
POSTGRES_USER=cabas
POSTGRES_PASSWORD=change-me
POSTGRES_DB=cabas
DATABASE_URL=postgresql://cabas:change-me@localhost:5432/cabas
UPLOADS_DIR=./uploads
APP_PORT=3000
TZ=Europe/Paris
```

Run: `cp .env.example .env && docker compose -f docker-compose.dev.yml --env-file .env up -d`
Expected: the `db` container is running.

- [ ] **Step 3: Write the failing env tests**

Create `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts a PostgreSQL URL and defaults the uploads directory", () => {
    expect(parseEnv({ DATABASE_URL: "postgresql://u:p@db:5432/cabas" })).toEqual({
      DATABASE_URL: "postgresql://u:p@db:5432/cabas",
      UPLOADS_DIR: "./uploads",
    });
  });

  it("rejects a missing or non-PostgreSQL database URL", () => {
    expect(() => parseEnv({})).toThrow();
    expect(() => parseEnv({ DATABASE_URL: "mysql://u:p@db/cabas" })).toThrow();
  });
});
```

Run: `pnpm test src/lib/env.test.ts`
Expected: FAIL, cannot resolve `./env`.

- [ ] **Step 4: Implement env parsing**

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export function getEnv(): Env {
  return parseEnv(process.env);
}
```

Run: `pnpm test src/lib/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the Prisma config and schema**

Create `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
```

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum SizeUnit {
  G
  ML
  PIECE
}

enum PriceSource {
  PURCHASE
  MANUAL
}

model Store {
  id        String             @id @default(uuid(7)) @db.Uuid
  name      String
  /// Lower-cased, trimmed, single-spaced name: enforces case-insensitive uniqueness.
  nameKey   String             @unique @map("name_key")
  address   String?
  logoPath  String?            @map("logo_path")
  createdAt DateTime           @default(now()) @map("created_at")
  updatedAt DateTime           @updatedAt @map("updated_at")
  prices    PriceObservation[]

  @@map("stores")
}

model Product {
  id             String               @id @default(uuid(7)) @db.Uuid
  name           String
  brand          String?
  photoPath      String?              @map("photo_path")
  sizeValue      Int                  @map("size_value")
  sizeUnit       SizeUnit             @map("size_unit")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")
  prices         PriceObservation[]
  alternativesAs ProductAlternative[] @relation("AlternativeA")
  alternativesBs ProductAlternative[] @relation("AlternativeB")

  @@index([name])
  @@map("products")
}

model PriceObservation {
  id             String      @id @default(uuid(7)) @db.Uuid
  productId      String      @map("product_id") @db.Uuid
  storeId        String      @map("store_id") @db.Uuid
  priceCents     Int         @map("price_cents")
  observedAt     DateTime    @map("observed_at") @db.Date
  source         PriceSource
  /// Linked to a purchase line in Plan 2 (foreign key added there).
  purchaseItemId String?     @unique @map("purchase_item_id") @db.Uuid
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")
  product        Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  store          Store       @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([productId, storeId, observedAt])
  @@index([storeId])
  @@map("price_observations")
}

model ProductAlternative {
  id         String   @id @default(uuid(7)) @db.Uuid
  /// Always the smaller of the two product IDs, so a pair is stored once.
  productAId String   @map("product_a_id") @db.Uuid
  productBId String   @map("product_b_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  productA   Product  @relation("AlternativeA", fields: [productAId], references: [id], onDelete: Cascade)
  productB   Product  @relation("AlternativeB", fields: [productBId], references: [id], onDelete: Cascade)

  @@unique([productAId, productBId])
  @@index([productBId])
  @@map("product_alternatives")
}
```

Add to `.gitignore`: `src/generated/` (already present from earlier setup; verify) and `uploads/`.

Run: `pnpm prisma migrate dev --name catalog`
Expected: migration created under `prisma/migrations/`, client generated in `src/generated/prisma`.

Add a `postinstall` script so the client exists after every install:

```bash
npm pkg set scripts.postinstall="prisma generate"
```

- [ ] **Step 6: Create the Prisma client singleton**

Create `src/server/db.ts`:

```ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { cabasPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.cabasPrisma) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      connectionTimeoutMillis: 5_000,
      max: 10,
    });
    globalForPrisma.cabasPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.cabasPrisma;
}
```

- [ ] **Step 7: Build the integration harness**

Create `tests/setup/empty.ts`:

```ts
export {};
```

Create `tests/setup/integration-global.ts`:

```ts
import { execSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const databaseUrl = container.getConnectionUri();
  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  project.provide("databaseUrl", databaseUrl);
}

export async function teardown() {
  await container?.stop();
}
```

Create `tests/setup/integration.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, inject, vi } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.UPLOADS_DIR = await mkdtemp(join(tmpdir(), "cabas-uploads-"));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db } = await import("@/server/db");

beforeEach(async () => {
  await db().$executeRawUnsafe(`
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables
               WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE format('TRUNCATE TABLE %I CASCADE', t.tablename);
      END LOOP;
    END $$;
  `);
});

afterAll(async () => {
  await db().$disconnect();
});
```

Replace `vitest.config.mts` with:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./tests/setup/empty.ts", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/domain/**/*.test.ts", "src/lib/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/server/**/*.test.ts"],
          globalSetup: ["./tests/setup/integration-global.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
```

- [ ] **Step 8: Write the failing integration smoke test**

Create `src/server/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { db } from "./db";

describe("database", () => {
  it("stores a product with its size in base units", async () => {
    const created = await db().product.create({
      data: { name: "Penne Rigate", brand: "Barilla", sizeValue: 500, sizeUnit: "G" },
    });
    const found = await db().product.findUniqueOrThrow({ where: { id: created.id } });
    expect(found).toMatchObject({ name: "Penne Rigate", sizeValue: 500, sizeUnit: "G" });
  });

  it("starts each test with empty tables", async () => {
    expect(await db().product.count()).toBe(0);
  });
});
```

Run: `pnpm test --project integration`
Expected: PASS once Docker is running (the harness starts its own container; first run pulls `postgres:18-alpine`). If it fails, fix the harness before moving on: this file proves migrations, truncation and the client work together.

- [ ] **Step 9: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all succeed (build needs no database because `db()` is lazy).

```bash
git add -A
git commit -m "feat(db): add prisma schema for the catalog and integration test harness"
```

---

### Task 6: Image storage and the uploads route

**Files:**
- Create: `src/lib/uploads.ts`, `src/server/storage/images.ts`, `src/app/uploads/[...path]/route.ts`
- Test: `src/lib/uploads.test.ts`, `src/server/storage/images.test.ts`

**Interfaces:**
- Consumes: `getEnv` (Task 5).
- Produces:
  - `type ImageKind = "stores" | "products" | "receipts"`
  - `class ImageRejectedError extends Error` — message in French, shown on the photo field.
  - `saveImage(file: File, kind: ImageKind): Promise<string>` — validates (≤ 10 MB, decodable JPEG/PNG/WebP), writes `<kind>/<uuid>.webp` and `<kind>/<uuid>-thumb.webp` under `UPLOADS_DIR`, returns the relative path of the main file (e.g. `"products/0199….webp"`).
  - `deleteImage(relativePath: string | null | undefined): Promise<void>` — removes the file and its thumbnail; ignores missing files.
  - In `src/lib/uploads.ts` (client-safe): `thumbPath(relativePath: string): string` — `"products/x.webp"` → `"products/x-thumb.webp"`; `uploadUrl(relativePath: string, options?: { thumb?: boolean }): string` — `"/uploads/products/x.webp"` or the thumbnail URL.
  - `resolveUploadPath(segments: string[]): string | null` — absolute path inside `UPLOADS_DIR`, or `null` on traversal or unknown kind.
  - Route `GET /uploads/<kind>/<file>.webp` serving files with `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 1: Install sharp**

```bash
pnpm add sharp
```

- [ ] **Step 2: Write and pass the URL helper tests**

Create `src/lib/uploads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { thumbPath, uploadUrl } from "./uploads";

describe("upload paths", () => {
  it("derives the thumbnail path", () => {
    expect(thumbPath("products/a.webp")).toBe("products/a-thumb.webp");
  });
  it("builds public URLs", () => {
    expect(uploadUrl("products/a.webp")).toBe("/uploads/products/a.webp");
    expect(uploadUrl("products/a.webp", { thumb: true })).toBe("/uploads/products/a-thumb.webp");
  });
});
```

Run: `pnpm test src/lib/uploads.test.ts` — Expected: FAIL (module missing). Then create `src/lib/uploads.ts`:

```ts
export function thumbPath(relativePath: string): string {
  return relativePath.replace(/\.webp$/, "-thumb.webp");
}

export function uploadUrl(relativePath: string, options: { thumb?: boolean } = {}): string {
  return `/uploads/${options.thumb ? thumbPath(relativePath) : relativePath}`;
}
```

Run again — Expected: PASS.

- [ ] **Step 3: Write the failing storage tests**

Create `src/server/storage/images.test.ts`:

```ts
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { thumbPath } from "@/lib/uploads";
import { deleteImage, ImageRejectedError, resolveUploadPath, saveImage } from "./images";

async function jpegFile(width: number, height: number, name = "photo.jpg"): Promise<File> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return new File([buffer], name, { type: "image/jpeg" });
}

const uploads = () => process.env.UPLOADS_DIR as string;

describe("saveImage", () => {
  it("re-encodes a photo to WebP, resizes it and writes a thumbnail", async () => {
    const path = await saveImage(await jpegFile(3000, 2000), "products");
    expect(path).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    const main = await sharp(await readFile(join(uploads(), path))).metadata();
    const thumb = await sharp(await readFile(join(uploads(), thumbPath(path)))).metadata();
    expect(main).toMatchObject({ format: "webp", width: 800 });
    expect(thumb).toMatchObject({ format: "webp", width: 300 });
  });

  it("keeps receipts up to 1600 px on the long edge", async () => {
    const path = await saveImage(await jpegFile(1000, 4000), "receipts");
    const main = await sharp(await readFile(join(uploads(), path))).metadata();
    expect(main.height).toBe(1600);
  });

  it("rejects a file that is not an image", async () => {
    const fake = new File([Buffer.from("%PDF-1.7 not an image")], "photo.jpg", { type: "image/jpeg" });
    await expect(saveImage(fake, "products")).rejects.toThrow(ImageRejectedError);
  });

  it("rejects a file over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await expect(saveImage(big, "products")).rejects.toThrow("10 Mo");
  });
});

describe("deleteImage", () => {
  it("removes the image and its thumbnail, and ignores missing files", async () => {
    const path = await saveImage(await jpegFile(400, 400), "stores");
    await deleteImage(path);
    await expect(stat(join(uploads(), path))).rejects.toThrow();
    await expect(stat(join(uploads(), thumbPath(path)))).rejects.toThrow();
    await expect(deleteImage(path)).resolves.toBeUndefined();
    await expect(deleteImage(null)).resolves.toBeUndefined();
  });
});

describe("resolveUploadPath", () => {
  it("resolves a file inside a known folder", () => {
    expect(resolveUploadPath(["products", "a.webp"])).toBe(join(uploads(), "products", "a.webp"));
  });

  it.each([
    [["..", ".env"]],
    [["products", "..", "..", ".env"]],
    [["products", "%2e%2e", ".env"]],
    [["secrets", "a.webp"]],
    [["products"]],
    [["products", "%E0%A4%A"]],
  ])("refuses %j", (segments) => {
    expect(resolveUploadPath(segments)).toBeNull();
  });
});
```

Run: `pnpm test src/server/storage/images.test.ts`
Expected: FAIL, cannot resolve `./images`.

- [ ] **Step 4: Implement storage**

Create `src/server/storage/images.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { getEnv } from "@/lib/env";
import { thumbPath } from "@/lib/uploads";

export type ImageKind = "stores" | "products" | "receipts";

const KINDS: readonly ImageKind[] = ["stores", "products", "receipts"];
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_EDGE: Record<ImageKind, number> = { stores: 800, products: 800, receipts: 1600 };
const THUMB_EDGE = 300;

export class ImageRejectedError extends Error {}

function uploadsRoot(): string {
  return resolve(getEnv().UPLOADS_DIR);
}

export async function saveImage(file: File, kind: ImageKind): Promise<string> {
  if (file.size > MAX_BYTES) throw new ImageRejectedError("L'image dépasse 10 Mo.");
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input)
    .metadata()
    .catch(() => null);
  if (!metadata?.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new ImageRejectedError("Ce fichier n'est pas une image JPEG, PNG ou WebP.");
  }

  const relativePath = `${kind}/${randomUUID()}.webp`;
  const resize = (edge: number) =>
    sharp(input).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const [main, thumb] = await Promise.all([resize(MAX_EDGE[kind]), resize(THUMB_EDGE)]);

  await mkdir(join(uploadsRoot(), kind), { recursive: true });
  await writeFile(join(uploadsRoot(), relativePath), main);
  await writeFile(join(uploadsRoot(), thumbPath(relativePath)), thumb);
  return relativePath;
}

export async function deleteImage(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const absolute = resolveUploadPath(relativePath.split("/"));
  if (!absolute) return;
  await rm(absolute, { force: true });
  await rm(thumbPath(absolute), { force: true });
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function resolveUploadPath(segments: string[]): string | null {
  const maybeDecoded = segments.map(safeDecode);
  if (maybeDecoded.includes(null)) return null;
  const decoded = maybeDecoded as string[];
  const [kind, ...rest] = decoded;
  if (!kind || !KINDS.includes(kind as ImageKind) || rest.length === 0) return null;
  if (decoded.some((segment) => segment === ".." || segment === "." || segment.includes("/") || segment.includes("\\"))) {
    return null;
  }
  const root = uploadsRoot();
  const absolute = resolve(root, ...decoded);
  return absolute.startsWith(root + sep) ? absolute : null;
}
```

Note: `sharp().metadata()` reads EXIF but `rotate()` with no argument applies EXIF orientation, and WebP output drops metadata by default.

Run: `pnpm test src/server/storage/images.test.ts`
Expected: PASS.

- [ ] **Step 5: Serve uploads**

Create `src/app/uploads/[...path]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolveUploadPath } from "@/server/storage/images";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const absolute = resolveUploadPath((await params).path);
  if (!absolute) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(absolute);
    return new Response(body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat(storage): store uploaded images as webp with thumbnails and serve them"
```

---

### Task 7: Theme, app shell and shared UI

**Files:**
- Create: `components.json` and `src/components/ui/*` (shadcn CLI), `src/lib/utils.ts` (shadcn CLI)
- Create: `src/components/layout/nav-items.ts`, `src/components/layout/app-nav.tsx`
- Create: `src/components/common/use-media-query.ts`, `responsive-dialog.tsx`, `submit-button.tsx`, `empty-state.tsx`
- Create: `tests/setup/components.ts`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `vitest.config.mts`, `eslint.config.mjs`, `docs/best-practices.md`
- Create: `src/app/error.tsx`, `src/app/not-found.tsx`
- Test: `src/components/layout/app-nav.test.tsx`

**Interfaces:**
- Produces:
  - `NAV_ITEMS: NavItem[]` with `type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean }`. Plan 1 ships Accueil (`/`), Produits (`/products`) and Magasins (`/stores`), all visible on mobile. Plan 2 adds Courses and the central ＋ button; Plan 3 adds Listes and moves Magasins to a header icon on mobile (spec §6.1).
  - `<AppNav />` — bottom bar under `lg`, left sidebar (240 px) from `lg`; the active item has `aria-current="page"`.
  - `<ResponsiveDialog open onOpenChange title description? children />` — `Drawer` under 1024 px, `Dialog` from 1024 px.
  - `<SubmitButton pending?>{children}</SubmitButton>` — disabled with a spinner while pending (`pending` prop, or the parent form status when omitted).
  - `<EmptyState title description action? />`
  - Tailwind tokens: `bg-background`, `text-primary`, `text-savings`, `bg-savings-soft`, `font-serif` (Fraunces), `font-mono` (JetBrains Mono, tabular figures), class `receipt-edge` (serrated bottom edge).

- [ ] **Step 1: Initialise shadcn/ui and add primitives**

```bash
pnpm dlx shadcn@latest init
```

Answer: base color **Stone**, CSS variables **yes**. Then:

```bash
pnpm dlx shadcn@latest add button input label dialog drawer sonner command popover select alert-dialog badge
pnpm add lucide-react
```

- [ ] **Step 2: Apply the "Ticket de caisse" tokens**

In `src/app/globals.css`, replace the generated `:root { … }` block with:

```css
:root {
  --radius: 0.375rem;
  --background: #fbf7f0;
  --foreground: #1c1917;
  --card: #fffdf8;
  --card-foreground: #1c1917;
  --popover: #fffdf8;
  --popover-foreground: #1c1917;
  --primary: #c2410c;
  --primary-foreground: #ffffff;
  --secondary: #f5ebdd;
  --secondary-foreground: #1c1917;
  --muted: #f5ebdd;
  --muted-foreground: #6b6460;
  --accent: #f5ebdd;
  --accent-foreground: #9a3412;
  --destructive: #b91c1c;
  --border: #e9e0d2;
  --input: #e9e0d2;
  --ring: #c2410c;
  --savings: #166534;
  --savings-soft: #f0fdf4;
}
```

Keep the generated `.dark { … }` block (dark polish is out of scope) and add `--savings: #4ade80; --savings-soft: #052e16;` inside it.

Inside the generated `@theme inline { … }` block, add:

```css
  --color-savings: var(--savings);
  --color-savings-soft: var(--savings-soft);
  --font-sans: var(--font-inter);
  --font-serif: var(--font-fraunces);
  --font-mono: var(--font-jetbrains-mono);
```

Append at the end of the file:

```css
@layer base {
  html {
    -webkit-tap-highlight-color: transparent;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-size: 16px;
  }
  h1,
  h2,
  h3 {
    @apply font-serif font-bold;
  }
  .font-mono {
    font-variant-numeric: tabular-nums;
  }
}

@utility receipt-edge {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    bottom: -6px;
    height: 6px;
    background: radial-gradient(circle at 5px 0, transparent 4px, var(--card) 4.5px) 0 0 / 10px 6px repeat-x;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Add the components test project**

Create `tests/setup/components.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= vi.fn();
```

In `vitest.config.mts`, add a third project to `test.projects`:

```ts
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/components/**/*.test.tsx"],
          setupFiles: ["./tests/setup/components.ts"],
        },
      },
```

- [ ] **Step 4: Write the failing navigation test**

Create `src/components/layout/app-nav.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNav } from "./app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/products/0199-abc" }));

describe("AppNav", () => {
  it("links every section in the mobile bar and the desktop sidebar", () => {
    render(<AppNav />);
    for (const nav of [screen.getByRole("navigation", { name: "Navigation principale" }), screen.getByRole("navigation", { name: "Menu" })]) {
      expect(within(nav).getByRole("link", { name: /Accueil/ })).toHaveAttribute("href", "/");
      expect(within(nav).getByRole("link", { name: /Produits/ })).toHaveAttribute("href", "/products");
      expect(within(nav).getByRole("link", { name: /Magasins/ })).toHaveAttribute("href", "/stores");
    }
  });

  it("marks the section of the current page as active", () => {
    render(<AppNav />);
    const sidebar = screen.getByRole("navigation", { name: "Menu" });
    expect(within(sidebar).getByRole("link", { name: /Produits/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: /Accueil/ })).not.toHaveAttribute("aria-current");
  });
});
```

Run: `pnpm test --project components`
Expected: FAIL, cannot resolve `./app-nav`.

- [ ] **Step 5: Implement the navigation**

Create `src/components/layout/nav-items.ts`:

```ts
import { House, LayoutGrid, type LucideIcon, Store } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", icon: House, mobile: true },
  { href: "/products", label: "Produits", icon: LayoutGrid, mobile: true },
  { href: "/stores", label: "Magasins", icon: Store, mobile: true },
];

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
```

Create `src/components/layout/app-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV_ITEMS.filter((item) => item.mobile).map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground",
                active && "font-bold text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-1 border-r bg-card px-3 py-4 lg:flex">
        <Link href="/" className="px-2 pb-4 font-serif text-2xl font-bold">
          cabas
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

Run: `pnpm test --project components`
Expected: PASS.

- [ ] **Step 6: Add the shared UI building blocks**

Create `src/components/common/use-media-query.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

Create `src/components/common/responsive-dialog.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "./use-media-query";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

export function ResponsiveDialog({ open, onOpenChange, title, description, children }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-serif">{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
```

Create `src/components/common/submit-button.tsx`:

```tsx
"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; className?: string; pending?: boolean };

/** `pending` overrides the form status for forms submitted through `onSubmit` + `startTransition`. */
export function SubmitButton({ children, className, pending: pendingProp }: Props) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className ?? "h-11 w-full"}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
```

Create `src/components/common/empty-state.tsx`:

```tsx
import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-card px-6 py-10 text-center">
      <h2 className="text-lg">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 7: Root layout, home placeholder and error pages**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["600", "700"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", weight: ["500", "700"] });

// Every page reads live data from the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "cabas", template: "%s · cabas" },
  description: "Suivi des courses et comparaison des prix",
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh">
        <AppNav />
        <main className="mx-auto max-w-6xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-24 lg:pb-10 lg:pl-[calc(15rem+2rem)] lg:pr-8">
          {children}
        </main>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx` (the dashboard comes in Plan 4):

```tsx
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <EmptyState
      title="Bienvenue dans cabas"
      description="Commence par ajouter tes magasins et tes produits pour comparer les prix."
      action={
        <Button asChild>
          <Link href="/products">Voir les produits</Link>
        </Button>
      }
    />
  );
}
```

Create `src/app/error.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Quelque chose s'est mal passé</h1>
      <p className="text-muted-foreground">Réessaie dans un instant. Si le problème continue, vérifie que la base de données est démarrée.</p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
```

Create `src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Page introuvable</h1>
      <p className="text-muted-foreground">Cette page n'existe pas ou a été supprimée.</p>
      <Button asChild>
        <Link href="/">Retour à l'accueil</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Allow plain `<img>` for uploads**

Uploaded images are already resized and encoded by sharp (Task 6), so the app renders them with plain `<img>` instead of `next/image`. In `eslint.config.mjs`, add a config object after the Next.js presets:

```js
  {
    // Uploads are pre-optimized by sharp and served with immutable caching.
    rules: { "@next/next/no-img-element": "off" },
  },
```

In `docs/best-practices.md`, section "Images (sharp + uploads volume)", replace the line "Render with `next/image` and `unoptimized`, because files are already optimized." with "Render uploads with plain `<img>` (with `width`/`height` or an aspect-ratio box, and `loading=\"lazy\"` below the fold), because files are already optimized."

- [ ] **Step 9: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass. Then `pnpm dev`, open http://localhost:3000 at 375 px and 1280 px widths: bottom bar on mobile, sidebar on desktop, cream background, Fraunces heading.

```bash
git add -A
git commit -m "feat(ui): add receipt theme, app navigation and shared dialog components"
```

---

### Task 8: Stores

**Files:**
- Create: `src/domain/store-name.ts`, `src/server/actions/result.ts`, `src/server/actions/form-data.ts`
- Create: `src/server/repositories/stores.ts`, `src/server/actions/stores.schema.ts`, `src/server/actions/stores.ts`
- Create: `src/components/common/image-field.tsx`, `src/components/stores/store-form.tsx`, `src/components/stores/store-list.tsx`, `src/app/stores/page.tsx`
- Test: `src/domain/store-name.test.ts`, `src/server/actions/stores.test.ts`, `src/components/stores/store-form.test.tsx`

**Interfaces:**
- Consumes: `db()` (Task 5), `saveImage`, `deleteImage`, `ImageRejectedError` (Task 6), `uploadUrl` (Task 6), `ResponsiveDialog`, `SubmitButton`, `EmptyState` (Task 7).
- Produces:
  - `normalizeStoreName(name: string): string` — trim, collapse spaces, lower-case (`fr-FR`).
  - `type FieldErrors = Partial<Record<string, string[]>>`; `type ActionResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors; message?: string }`; `type ActionState<T> = ActionResult<T> | null`; `invalid(error: z.ZodError): { ok: false; errors: FieldErrors }`; `failure(message: string, errors?: FieldErrors): { ok: false; errors: FieldErrors; message: string }`.
  - `optionalFile(formData: FormData, key: string): File | null` — `null` for an empty file input.
  - `type StoreSummary = { id: string; name: string; address: string | null; logoPath: string | null }`
  - Repository: `listStores(): Promise<StoreSummary[]>` (by name), `createStore(input: { name: string; address: string | null; logoPath: string | null }): Promise<StoreSummary>`, `updateStore(id: string, input: { name: string; address: string | null; logoPath: string | null }): Promise<StoreSummary>`, `deleteStore(id: string): Promise<StoreSummary>`; errors `DuplicateStoreError`, `StoreInUseError`.
  - Actions (`"use server"`): `createStoreAction(prev: ActionState<StoreSummary>, formData: FormData): Promise<ActionResult<StoreSummary>>`, `updateStoreAction(id: string, prev, formData)`, `deleteStoreAction(id: string): Promise<ActionResult<null>>`. Form fields: `name`, `address`, `logo` (file).
  - `<StoreForm action store? onDone />` — reused by the store combobox in Task 10.

- [ ] **Step 1: Write and pass the name normalisation test**

Create `src/domain/store-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeStoreName } from "./store-name";

describe("normalizeStoreName", () => {
  it("ignores case and extra spaces", () => {
    expect(normalizeStoreName("  Lidl   Lomme ")).toBe("lidl lomme");
    expect(normalizeStoreName("LIDL LOMME")).toBe(normalizeStoreName("lidl lomme"));
  });
});
```

Run: `pnpm test src/domain/store-name.test.ts` — Expected: FAIL (module missing). Create `src/domain/store-name.ts`:

```ts
export function normalizeStoreName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}
```

Run again — Expected: PASS.

- [ ] **Step 2: Add the action helpers**

Create `src/server/actions/result.ts`:

```ts
import { z } from "zod";

export type FieldErrors = Partial<Record<string, string[]>>;
export type ActionResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors; message?: string };
export type ActionState<T> = ActionResult<T> | null;

export function invalid(error: z.ZodError): { ok: false; errors: FieldErrors } {
  return { ok: false, errors: z.flattenError(error).fieldErrors as FieldErrors };
}

export function failure(message: string, errors: FieldErrors = {}): { ok: false; errors: FieldErrors; message: string } {
  return { ok: false, errors, message };
}
```

Create `src/server/actions/form-data.ts`:

```ts
export function optionalFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
```

- [ ] **Step 3: Write the failing store action tests**

Create `src/server/actions/stores.test.ts`:

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listStores } from "@/server/repositories/stores";
import { createStoreAction, deleteStoreAction, updateStoreAction } from "./stores";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function logo(): Promise<File> {
  const buffer = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#0050aa" } }).png().toBuffer();
  return new File([buffer], "logo.png", { type: "image/png" });
}

describe("store actions", () => {
  it("creates a store with its logo", async () => {
    const result = await createStoreAction(null, form({ name: " Lidl Lomme ", address: "Rue de Lille", logo: await logo() }));
    expect(result.ok).toBe(true);
    const [store] = await listStores();
    expect(store).toMatchObject({ name: "Lidl Lomme", address: "Rue de Lille" });
    expect(store?.logoPath).toMatch(/^stores\/.+\.webp$/);
  });

  it("requires a name", async () => {
    const result = await createStoreAction(null, form({ name: "  " }));
    expect(result).toEqual({ ok: false, errors: { name: ["Indique le nom du magasin."] } });
  });

  it("refuses a duplicate name regardless of case and spaces", async () => {
    await createStoreAction(null, form({ name: "Lidl Lomme" }));
    const result = await createStoreAction(null, form({ name: " lidl   LOMME" }));
    expect(result).toMatchObject({ ok: false, errors: { name: ["Ce magasin existe déjà."] } });
    expect(await listStores()).toHaveLength(1);
  });

  it("rejects a logo that is not an image and creates nothing", async () => {
    const fake = new File([Buffer.from("%PDF-1.7")], "logo.jpg", { type: "image/jpeg" });
    const result = await createStoreAction(null, form({ name: "Auchan", logo: fake }));
    expect(result).toMatchObject({ ok: false, errors: { logo: ["Ce fichier n'est pas une image JPEG, PNG ou WebP."] } });
    expect(await listStores()).toHaveLength(0);
  });

  it("updates a store", async () => {
    const created = await createStoreAction(null, form({ name: "Leclerc" }));
    if (!created.ok) throw new Error("setup failed");
    const result = await updateStoreAction(created.data.id, null, form({ name: "Leclerc Templeuve", address: "" }));
    expect(result).toMatchObject({ ok: true, data: { name: "Leclerc Templeuve", address: null } });
  });

  it("deletes an unused store", async () => {
    const created = await createStoreAction(null, form({ name: "Leclerc" }));
    if (!created.ok) throw new Error("setup failed");
    expect(await deleteStoreAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await listStores()).toHaveLength(0);
  });

  it("refuses to delete a store that has prices", async () => {
    const created = await createStoreAction(null, form({ name: "Lidl" }));
    if (!created.ok) throw new Error("setup failed");
    const product = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
    await db().priceObservation.create({
      data: { productId: product.id, storeId: created.data.id, priceCents: 99, observedAt: new Date(), source: "MANUAL" },
    });
    const result = await deleteStoreAction(created.data.id);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("ne peut pas être supprimé") });
    expect(await listStores()).toHaveLength(1);
  });
});
```

Run: `pnpm test src/server/actions/stores.test.ts`
Expected: FAIL, cannot resolve `@/server/repositories/stores`.

- [ ] **Step 4: Implement the repository**

Create `src/server/repositories/stores.ts`:

```ts
import "server-only";
import { normalizeStoreName } from "@/domain/store-name";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type StoreSummary = { id: string; name: string; address: string | null; logoPath: string | null };
type StoreInput = { name: string; address: string | null; logoPath: string | null };

export class DuplicateStoreError extends Error {}
export class StoreInUseError extends Error {}

const summary = { id: true, name: true, address: true, logoPath: true } as const;

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function listStores(): Promise<StoreSummary[]> {
  return db().store.findMany({ select: summary, orderBy: { name: "asc" } });
}

export async function getStore(id: string): Promise<StoreSummary | null> {
  return db().store.findUnique({ where: { id }, select: summary });
}

export async function createStore(input: StoreInput): Promise<StoreSummary> {
  try {
    return await db().store.create({ data: { ...input, nameKey: normalizeStoreName(input.name) }, select: summary });
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new DuplicateStoreError();
    throw error;
  }
}

export async function updateStore(id: string, input: StoreInput): Promise<StoreSummary> {
  try {
    return await db().store.update({
      where: { id },
      data: { ...input, nameKey: normalizeStoreName(input.name) },
      select: summary,
    });
  } catch (error) {
    if (isPrismaError(error, "P2002")) throw new DuplicateStoreError();
    throw error;
  }
}

export async function deleteStore(id: string): Promise<StoreSummary> {
  try {
    return await db().store.delete({ where: { id }, select: summary });
  } catch (error) {
    if (isPrismaError(error, "P2003")) throw new StoreInUseError();
    throw error;
  }
}
```

- [ ] **Step 5: Implement the schema and actions**

Create `src/server/actions/stores.schema.ts`:

```ts
import { z } from "zod";

export const storeInputSchema = z.object({
  name: z.string().trim().min(1, "Indique le nom du magasin.").max(80, "80 caractères maximum."),
  address: z
    .string()
    .trim()
    .max(200, "200 caractères maximum.")
    .transform((value) => value || null),
});
```

Create `src/server/actions/stores.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createStore,
  deleteStore,
  DuplicateStoreError,
  getStore,
  StoreInUseError,
  type StoreSummary,
  updateStore,
} from "@/server/repositories/stores";
import { deleteImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { type ActionResult, type ActionState, failure, invalid } from "./result";
import { storeInputSchema } from "./stores.schema";

const DUPLICATE = { name: ["Ce magasin existe déjà."] };

async function saveLogo(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "logo");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "stores") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

export async function createStoreAction(
  _prev: ActionState<StoreSummary>,
  formData: FormData,
): Promise<ActionResult<StoreSummary>> {
  const parsed = storeInputSchema.safeParse({ name: text(formData, "name"), address: text(formData, "address") });
  if (!parsed.success) return invalid(parsed.error);

  const logo = await saveLogo(formData);
  if ("error" in logo) return { ok: false, errors: { logo: [logo.error] } };

  try {
    const store = await createStore({ ...parsed.data, logoPath: logo.path });
    revalidatePath("/stores");
    return { ok: true, data: store };
  } catch (error) {
    await deleteImage(logo.path);
    if (error instanceof DuplicateStoreError) return { ok: false, errors: DUPLICATE };
    throw error;
  }
}

export async function updateStoreAction(
  id: string,
  _prev: ActionState<StoreSummary>,
  formData: FormData,
): Promise<ActionResult<StoreSummary>> {
  const parsed = storeInputSchema.safeParse({ name: text(formData, "name"), address: text(formData, "address") });
  if (!parsed.success) return invalid(parsed.error);

  const existing = await getStore(id);
  if (!existing) return failure("Ce magasin n'existe plus.");

  const logo = await saveLogo(formData);
  if ("error" in logo) return { ok: false, errors: { logo: [logo.error] } };

  try {
    const store = await updateStore(id, { ...parsed.data, logoPath: logo.path ?? existing.logoPath });
    if (logo.path) await deleteImage(existing.logoPath);
    revalidatePath("/stores");
    return { ok: true, data: store };
  } catch (error) {
    await deleteImage(logo.path);
    if (error instanceof DuplicateStoreError) return { ok: false, errors: DUPLICATE };
    throw error;
  }
}

export async function deleteStoreAction(id: string): Promise<ActionResult<null>> {
  try {
    const store = await deleteStore(id);
    await deleteImage(store.logoPath);
    revalidatePath("/stores");
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof StoreInUseError) {
      return failure("Ce magasin est utilisé par des prix ou des courses : il ne peut pas être supprimé.");
    }
    throw error;
  }
}
```

Run: `pnpm test src/server/actions/stores.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing store form test**

Create `src/components/stores/store-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StoreForm } from "./store-form";

describe("StoreForm", () => {
  it("shows the error returned for a field and keeps the typed values", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { name: ["Ce magasin existe déjà."] } });
    render(<StoreForm action={action} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Lidl Lomme");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Ce magasin existe déjà.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Lidl Lomme");
    expect(screen.getByLabelText("Nom")).toHaveAttribute("aria-invalid", "true");
  });

  it("hands the saved store back on success", async () => {
    const store = { id: "s1", name: "Lidl", address: null, logoPath: null };
    const action = vi.fn().mockResolvedValue({ ok: true, data: store });
    const onDone = vi.fn();
    render(<StoreForm action={action} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Lidl");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(store));
  });
});
```

Run: `pnpm test src/components/stores/store-form.test.tsx`
Expected: FAIL, cannot resolve `./store-form`.

- [ ] **Step 7: Implement the form components**

Create `src/components/common/image-field.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadUrl } from "@/lib/uploads";

type Props = { name: string; label: string; currentPath?: string | null; errors?: string[]; capture?: boolean };

export function ImageField({ name, label, currentPath, errors, capture }: Props) {
  const [preview, setPreview] = useState<string | null>(currentPath ? uploadUrl(currentPath, { thumb: true }) : null);
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
          capture={capture ? "environment" : undefined}
          aria-invalid={errors ? true : undefined}
          aria-describedby={errors ? errorId : undefined}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
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

Create `src/components/stores/store-form.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useEffect } from "react";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { StoreSummary } from "@/server/repositories/stores";

type Props = {
  action: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  store?: StoreSummary;
  defaultName?: string;
  onDone: (store: StoreSummary) => void;
};

export function StoreForm({ action, store, defaultName, onDone }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) onDone(state.data);
  }, [state, onDone]);

  // Submitting through onSubmit (instead of `action=`) keeps typed values after a validation error.
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input
          id="name"
          name="name"
          defaultValue={store?.name ?? defaultName}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          autoFocus={Boolean(errors.name)}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-sm text-destructive">
            {errors.name[0]}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">
          Adresse <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input id="address" name="address" defaultValue={store?.address ?? ""} autoComplete="street-address" />
      </div>
      <ImageField name="logo" label="Logo (facultatif)" currentPath={store?.logoPath} errors={errors.logo} />
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

Run: `pnpm test src/components/stores/store-form.test.tsx`
Expected: PASS.

- [ ] **Step 8: Build the stores page**

Create `src/components/stores/store-list.tsx`:

```tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { createStoreAction, deleteStoreAction, updateStoreAction } from "@/server/actions/stores";
import type { StoreSummary } from "@/server/repositories/stores";
import { uploadUrl } from "@/lib/uploads";
import { StoreForm } from "./store-form";

type Editing = { mode: "create" } | { mode: "edit"; store: StoreSummary } | null;

export function StoreList({ stores }: { stores: StoreSummary[] }) {
  const [editing, setEditing] = useState<Editing>(null);

  async function remove(store: StoreSummary) {
    if (!window.confirm(`Supprimer « ${store.name} » ?`)) return;
    const result = await deleteStoreAction(store.id);
    if (result.ok) toast.success("Magasin supprimé");
    else toast.error(result.message ?? "Suppression impossible");
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Magasins</h1>
        <Button onClick={() => setEditing({ mode: "create" })} className="h-11">
          <Plus aria-hidden /> Nouveau magasin
        </Button>
      </div>

      {stores.length === 0 ? (
        <EmptyState title="Aucun magasin" description="Ajoute les magasins où tu fais tes courses." />
      ) : (
        <ul className="divide-y divide-dashed rounded-md border bg-card">
          {stores.map((store) => (
            <li key={store.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary font-bold text-primary">
                {store.logoPath ? <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" /> : store.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{store.name}</p>
                {store.address && <p className="truncate text-sm text-muted-foreground">{store.address}</p>}
              </div>
              <Button variant="ghost" size="icon" className="size-11" aria-label={`Modifier ${store.name}`} onClick={() => setEditing({ mode: "edit", store })}>
                <Pencil aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="size-11" aria-label={`Supprimer ${store.name}`} onClick={() => remove(store)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.mode === "edit" ? "Modifier le magasin" : "Nouveau magasin"}
      >
        {editing && (
          <StoreForm
            key={editing.mode === "edit" ? editing.store.id : "new"}
            action={editing.mode === "edit" ? updateStoreAction.bind(null, editing.store.id) : createStoreAction}
            store={editing.mode === "edit" ? editing.store : undefined}
            onDone={() => {
              toast.success("Magasin enregistré");
              setEditing(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
```

`window.confirm` keeps the confirmation step simple (KISS). Plan 2 can replace it with an `AlertDialog` if it feels out of place on mobile.

Create `src/app/stores/page.tsx`:

```tsx
import type { Metadata } from "next";
import { StoreList } from "@/components/stores/store-list";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Magasins" };

export default async function StoresPage() {
  return <StoreList stores={await listStores()} />;
}
```

- [ ] **Step 9: Visual check, verify and commit**

Run `pnpm dev`, open `/stores` at 375 px and 1280 px: create, edit and delete a store, try a duplicate name, and try a PDF as logo. Show the screens to the user and wait for their go-ahead.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat(stores): manage stores with logo, duplicate and in-use protection"
```

---

### Task 9: Products catalog

**Files:**
- Create: `src/server/repositories/products.ts`, `src/server/actions/products.schema.ts`, `src/server/actions/products.ts`
- Create: `src/components/common/use-form-action.ts`, `src/components/common/field-error.tsx`
- Create: `src/components/products/product-form.tsx`, `src/components/products/product-card.tsx`, `src/components/products/new-product-button.tsx`, `src/app/products/page.tsx`
- Modify: `src/components/stores/store-form.tsx` (refactor onto `useFormAction` and `FieldError`)
- Test: `src/server/actions/products.test.ts`, `src/components/products/product-form.test.tsx`

**Interfaces:**
- Consumes: `latestPricesByStore`, `cheapestStorePrice` (Task 3), `formatSize`, `formatEuros` (Tasks 1–2), storage (Task 6), action helpers (Task 8).
- Produces:
  - `type ProductSummary = { id: string; name: string; brand: string | null; photoPath: string | null; sizeValue: number; sizeUnit: SizeUnit; bestPriceCents: number | null }`
  - Repository: `listProducts(query?: string): Promise<ProductSummary[]>` (name or brand contains `query`, case-insensitive, sorted by name), `getProduct(id: string): Promise<ProductSummary | null>`, `createProduct(input: ProductInput): Promise<ProductSummary>`, `updateProduct(id: string, input: ProductInput): Promise<ProductSummary>`, `deleteProduct(id: string): Promise<ProductSummary>`, with `type ProductInput = { name: string; brand: string | null; sizeValue: number; sizeUnit: SizeUnit; photoPath: string | null }`.
  - Actions: `createProductAction(prev: ActionState<ProductSummary>, formData: FormData)`, `updateProductAction(id: string, prev, formData)`, `deleteProductAction(id: string): Promise<ActionResult<null>>`. Fields: `name`, `brand`, `sizeValue`, `sizeUnit` (`G | ML | PIECE`), `photo` (file).
  - `useFormAction<T>(action, onDone): { state; errors: FieldErrors; pending: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }`
  - `<FieldError id: string errors?: string[] />`
  - `<ProductForm action product? defaultName? onDone />` — reused by the purchase form in Plan 2.

- [ ] **Step 1: Write the failing product action tests**

Create `src/server/actions/products.test.ts`:

```ts
import { stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getProduct, listProducts } from "@/server/repositories/products";
import { createProductAction, deleteProductAction, updateProductAction } from "./products";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const penne = { name: "Penne Rigate", brand: "Barilla", sizeValue: "500", sizeUnit: "G" };

async function photo(): Promise<File> {
  const buffer = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#f5ebdd" } }).jpeg().toBuffer();
  return new File([buffer], "penne.jpg", { type: "image/jpeg" });
}

async function storeId(name: string): Promise<string> {
  const store = await db().store.create({ data: { name, nameKey: name.toLowerCase() } });
  return store.id;
}

describe("product actions", () => {
  it("creates a product with its photo", async () => {
    const result = await createProductAction(null, form({ ...penne, photo: await photo() }));
    expect(result).toMatchObject({ ok: true, data: { name: "Penne Rigate", brand: "Barilla", sizeValue: 500, sizeUnit: "G", bestPriceCents: null } });
    if (!result.ok) return;
    expect(result.data.photoPath).toMatch(/^products\/.+\.webp$/);
  });

  it.each([
    [{ sizeValue: "" }, "sizeValue", "La contenance doit être supérieure à 0."],
    [{ sizeValue: "0" }, "sizeValue", "La contenance doit être supérieure à 0."],
    [{ sizeValue: "1,5" }, "sizeValue", "La contenance doit être un nombre entier (ex. 1500 pour 1,5 kg)."],
    [{ sizeValue: "abc" }, "sizeValue", "Indique la contenance en chiffres."],
    [{ sizeUnit: "KG" }, "sizeUnit", "Choisis une unité."],
    [{ name: " " }, "name", "Indique le nom du produit."],
  ])("rejects %j", async (override, field, message) => {
    const result = await createProductAction(null, form({ ...penne, ...override }));
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await listProducts()).toHaveLength(0);
  });

  it("lists products with their best known price and filters by name or brand", async () => {
    const created = await createProductAction(null, form(penne));
    await createProductAction(null, form({ name: "Lait demi-écrémé", brand: "Lactel", sizeValue: "1000", sizeUnit: "ML" }));
    if (!created.ok) throw new Error("setup failed");
    const day = new Date("2026-10-01");
    await db().priceObservation.createMany({
      data: [
        { productId: created.data.id, storeId: await storeId("Lidl"), priceCents: 99, observedAt: day, source: "MANUAL" },
        { productId: created.data.id, storeId: await storeId("Leclerc"), priceCents: 115, observedAt: day, source: "MANUAL" },
      ],
    });

    const all = await listProducts();
    expect(all.map((p) => [p.name, p.bestPriceCents])).toEqual([
      ["Lait demi-écrémé", null],
      ["Penne Rigate", 99],
    ]);
    expect((await listProducts("barilla")).map((p) => p.name)).toEqual(["Penne Rigate"]);
    expect((await listProducts("LAIT")).map((p) => p.name)).toEqual(["Lait demi-écrémé"]);
  });

  it("updates a product", async () => {
    const created = await createProductAction(null, form(penne));
    if (!created.ok) throw new Error("setup failed");
    const result = await updateProductAction(created.data.id, null, form({ ...penne, sizeValue: "1000", brand: "" }));
    expect(result).toMatchObject({ ok: true, data: { sizeValue: 1000, brand: null } });
  });

  it("deletes a product with its photo and prices", async () => {
    const created = await createProductAction(null, form({ ...penne, photo: await photo() }));
    if (!created.ok || !created.data.photoPath) throw new Error("setup failed");
    await db().priceObservation.create({
      data: { productId: created.data.id, storeId: await storeId("Lidl"), priceCents: 99, observedAt: new Date(), source: "MANUAL" },
    });
    expect(await deleteProductAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await getProduct(created.data.id)).toBeNull();
    expect(await db().priceObservation.count()).toBe(0);
    await expect(stat(join(process.env.UPLOADS_DIR as string, created.data.photoPath))).rejects.toThrow();
  });
});
```

Run: `pnpm test src/server/actions/products.test.ts`
Expected: FAIL, cannot resolve `@/server/repositories/products`.

- [ ] **Step 2: Implement the repository**

Create `src/server/repositories/products.ts`:

```ts
import "server-only";
import { cheapestStorePrice, latestPricesByStore } from "@/domain/latest-prices";
import type { SizeUnit } from "@/domain/types";
import { db } from "@/server/db";

export type ProductSummary = {
  id: string;
  name: string;
  brand: string | null;
  photoPath: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
  bestPriceCents: number | null;
};

export type ProductInput = {
  name: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: SizeUnit;
  photoPath: string | null;
};

const withPrices = {
  id: true,
  name: true,
  brand: true,
  photoPath: true,
  sizeValue: true,
  sizeUnit: true,
  prices: { select: { storeId: true, priceCents: true, observedAt: true, createdAt: true } },
} as const;

type Row = Omit<ProductSummary, "bestPriceCents"> & {
  prices: { storeId: string; priceCents: number; observedAt: Date; createdAt: Date }[];
};

function toSummary({ prices, ...product }: Row): ProductSummary {
  return { ...product, bestPriceCents: cheapestStorePrice(latestPricesByStore(prices))?.priceCents ?? null };
}

export async function listProducts(query?: string): Promise<ProductSummary[]> {
  const q = query?.trim();
  const rows = await db().product.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] }
      : undefined,
    select: withPrices,
    orderBy: { name: "asc" },
  });
  return rows.map(toSummary);
}

export async function getProduct(id: string): Promise<ProductSummary | null> {
  const row = await db().product.findUnique({ where: { id }, select: withPrices });
  return row ? toSummary(row) : null;
}

export async function createProduct(input: ProductInput): Promise<ProductSummary> {
  return toSummary(await db().product.create({ data: input, select: withPrices }));
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductSummary> {
  return toSummary(await db().product.update({ where: { id }, data: input, select: withPrices }));
}

export async function deleteProduct(id: string): Promise<ProductSummary> {
  return toSummary(await db().product.delete({ where: { id }, select: withPrices }));
}
```

- [ ] **Step 3: Implement the schema and actions**

Create `src/server/actions/products.schema.ts`:

```ts
import { z } from "zod";

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Indique le nom du produit.").max(120, "120 caractères maximum."),
  brand: z
    .string()
    .trim()
    .max(80, "80 caractères maximum.")
    .transform((value) => value || null),
  sizeValue: z
    .string()
    .trim()
    .refine((value) => !/[.,]/.test(value), "La contenance doit être un nombre entier (ex. 1500 pour 1,5 kg).")
    .transform(Number)
    .pipe(z.number({ error: "Indique la contenance en chiffres." }).int().positive("La contenance doit être supérieure à 0.")),
  sizeUnit: z.enum(["G", "ML", "PIECE"], { error: "Choisis une unité." }),
});
```

`Number("")` is `0`, so an empty field reaches the "supérieure à 0" message; `"1,5"` is caught by the refine before conversion.

Create `src/server/actions/products.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  deleteProduct,
  getProduct,
  type ProductSummary,
  updateProduct,
} from "@/server/repositories/products";
import { deleteImage, ImageRejectedError, saveImage } from "@/server/storage/images";
import { optionalFile, text } from "./form-data";
import { productInputSchema } from "./products.schema";
import { type ActionResult, type ActionState, failure, invalid } from "./result";

function parse(formData: FormData) {
  return productInputSchema.safeParse({
    name: text(formData, "name"),
    brand: text(formData, "brand"),
    sizeValue: text(formData, "sizeValue"),
    sizeUnit: text(formData, "sizeUnit"),
  });
}

async function savePhoto(formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = optionalFile(formData, "photo");
  if (!file) return { path: null };
  try {
    return { path: await saveImage(file, "products") };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { error: error.message };
    throw error;
  }
}

export async function createProductAction(
  _prev: ActionState<ProductSummary>,
  formData: FormData,
): Promise<ActionResult<ProductSummary>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const photo = await savePhoto(formData);
  if ("error" in photo) return { ok: false, errors: { photo: [photo.error] } };
  try {
    const product = await createProduct({ ...parsed.data, photoPath: photo.path });
    revalidatePath("/products");
    return { ok: true, data: product };
  } catch (error) {
    await deleteImage(photo.path);
    throw error;
  }
}

export async function updateProductAction(
  id: string,
  _prev: ActionState<ProductSummary>,
  formData: FormData,
): Promise<ActionResult<ProductSummary>> {
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error);
  const existing = await getProduct(id);
  if (!existing) return failure("Ce produit n'existe plus.");
  const photo = await savePhoto(formData);
  if ("error" in photo) return { ok: false, errors: { photo: [photo.error] } };
  try {
    const product = await updateProduct(id, { ...parsed.data, photoPath: photo.path ?? existing.photoPath });
    if (photo.path) await deleteImage(existing.photoPath);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, data: product };
  } catch (error) {
    await deleteImage(photo.path);
    throw error;
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  const product = await deleteProduct(id);
  await deleteImage(product.photoPath);
  revalidatePath("/products");
  return { ok: true, data: null };
}
```

Run: `pnpm test src/server/actions/products.test.ts`
Expected: PASS.

- [ ] **Step 4: Extract the form hook and field error (refactor, tests stay green)**

Create `src/components/common/use-form-action.ts`:

```ts
"use client";

import { type FormEvent, startTransition, useActionState, useEffect } from "react";
import type { ActionResult, ActionState, FieldErrors } from "@/server/actions/result";

type FormAction<T> = (prev: ActionState<T>, formData: FormData) => Promise<ActionResult<T>>;

/** Submits through onSubmit so typed values survive a validation error (no automatic form reset). */
export function useFormAction<T>(action: FormAction<T>, onDone: (data: T) => void) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors: FieldErrors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) onDone(state.data);
  }, [state, onDone]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return { state, errors, pending, onSubmit };
}
```

Create `src/components/common/field-error.tsx`:

```tsx
export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {errors[0]}
    </p>
  );
}
```

Refactor `src/components/stores/store-form.tsx` to use them: replace the `useActionState`/`useEffect`/inline `onSubmit` code with `const { state, errors, pending, onSubmit } = useFormAction(action, onDone);`, set `<form className="grid gap-4" noValidate onSubmit={onSubmit}>`, and replace the inline error paragraphs with `<FieldError id="name-error" errors={errors.name} />`. Remove the unused React imports.

Run: `pnpm test --project components`
Expected: PASS (StoreForm tests unchanged and green).

- [ ] **Step 5: Write the failing product form test**

Create `src/components/products/product-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductForm } from "./product-form";

describe("ProductForm", () => {
  it("sends the size in base units with the chosen unit", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: {} });
    render(<ProductForm action={action} defaultName="Riz basmati" onDone={vi.fn()} />);
    expect(screen.getByLabelText("Nom")).toHaveValue("Riz basmati");
    await userEvent.type(screen.getByLabelText("Contenance"), "1000");
    await userEvent.selectOptions(screen.getByLabelText("Unité"), "g");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(sent.get("sizeValue")).toBe("1000");
    expect(sent.get("sizeUnit")).toBe("G");
  });

  it("shows the size error next to the field", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, errors: { sizeValue: ["La contenance doit être supérieure à 0."] } });
    render(<ProductForm action={action} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Nom"), "Penne");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("La contenance doit être supérieure à 0.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contenance")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nom")).toHaveValue("Penne");
  });
});
```

Run: `pnpm test src/components/products/product-form.test.tsx`
Expected: FAIL, cannot resolve `./product-form`.

- [ ] **Step 6: Implement the product form**

Create `src/components/products/product-form.tsx`:

```tsx
"use client";

import { FieldError } from "@/components/common/field-error";
import { ImageField } from "@/components/common/image-field";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";

type Props = {
  action: (prev: ActionState<ProductSummary>, formData: FormData) => Promise<ActionResult<ProductSummary>>;
  product?: ProductSummary;
  defaultName?: string;
  onDone: (product: ProductSummary) => void;
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProductForm({ action, product, defaultName, onDone }: Props) {
  const { state, errors, pending, onSubmit } = useFormAction(action, onDone);

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <ImageField name="photo" label="Photo (facultatif)" currentPath={product?.photoPath} errors={errors.photo} capture />
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom</Label>
        <Input id="name" name="name" defaultValue={product?.name ?? defaultName} autoComplete="off"
          aria-invalid={errors.name ? true : undefined} aria-describedby="name-error" />
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
          <Input id="sizeValue" name="sizeValue" inputMode="numeric" className="font-mono"
            defaultValue={product?.sizeValue ?? ""}
            aria-invalid={errors.sizeValue ? true : undefined} aria-describedby="sizeValue-error" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sizeUnit">Unité</Label>
          <select id="sizeUnit" name="sizeUnit" defaultValue={product?.sizeUnit ?? "G"} className={selectClass}
            aria-invalid={errors.sizeUnit ? true : undefined}>
            <option value="G">g</option>
            <option value="ML">ml</option>
            <option value="PIECE">pièces</option>
          </select>
        </div>
        <div className="col-span-2 -mt-1">
          <FieldError id="sizeValue-error" errors={errors.sizeValue ?? errors.sizeUnit} />
          {!errors.sizeValue && !errors.sizeUnit && (
            <p className="text-xs text-muted-foreground">En grammes, millilitres ou pièces : 1,5 kg = 1500 g.</p>
          )}
        </div>
      </div>
      {state && !state.ok && state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      <SubmitButton pending={pending}>Enregistrer</SubmitButton>
    </form>
  );
}
```

Run: `pnpm test src/components/products/product-form.test.tsx`
Expected: PASS.

- [ ] **Step 7: Build the products grid page**

Create `src/components/products/product-card.tsx`:

```tsx
import Link from "next/link";
import { formatEuros } from "@/domain/money";
import { formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import type { ProductSummary } from "@/server/repositories/products";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link href={`/products/${product.id}`} className="flex flex-col gap-1 rounded-md border bg-card p-2 transition-transform active:scale-[0.98]">
      <div className="aspect-square overflow-hidden rounded-sm bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)]">
        {product.photoPath && (
          <img src={uploadUrl(product.photoPath, { thumb: true })} alt={product.name} loading="lazy" width={300} height={300} className="size-full object-cover" />
        )}
      </div>
      <p className="text-sm font-semibold leading-tight">{product.name}</p>
      <p className="text-xs text-muted-foreground">
        {[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}
      </p>
      <p className="font-mono text-sm font-bold text-savings">
        {product.bestPriceCents === null ? <span className="font-sans font-normal text-muted-foreground">Pas encore de prix</span> : `dès ${formatEuros(product.bestPriceCents)}`}
      </p>
    </Link>
  );
}
```

Create `src/components/products/new-product-button.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { createProductAction } from "@/server/actions/products";
import { ProductForm } from "./product-form";

export function NewProductButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button className="h-11" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Nouveau produit
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Nouveau produit">
        <ProductForm
          action={createProductAction}
          onDone={(product) => {
            toast.success("Produit créé");
            setOpen(false);
            router.push(`/products/${product.id}`);
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
```

Create `src/app/products/page.tsx`:

```tsx
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/empty-state";
import { NewProductButton } from "@/components/products/new-product-button";
import { ProductCard } from "@/components/products/product-card";
import { Input } from "@/components/ui/input";
import { listProducts } from "@/server/repositories/products";

export const metadata: Metadata = { title: "Produits" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = await listProducts(q);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">Produits</h1>
        <NewProductButton />
      </div>
      <form role="search" className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" defaultValue={q} placeholder="Rechercher un produit" aria-label="Rechercher un produit" className="h-11 pl-9" />
      </form>
      {products.length === 0 ? (
        <EmptyState
          title={q ? "Aucun résultat" : "Aucun produit"}
          description={q ? `Aucun produit ne correspond à « ${q} ».` : "Crée ton premier produit pour suivre son prix."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Visual check, verify and commit**

Run `pnpm dev`, open `/products` at 375 px and 1280 px, create two products, search by brand. Compare with mockup screen 4 (mobile and desktop), show the user and wait for their go-ahead.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat(products): add product catalog with search, photos and best price"
```

---

### Task 10: Product detail, price comparison and manual prices

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/ids.ts`, `src/server/repositories/prices.ts`, `src/server/actions/prices.schema.ts`, `src/server/actions/prices.ts`
- Create: `src/components/common/entity-combobox.tsx`, `src/components/products/price-table.tsx`, `src/components/products/price-form.tsx`, `src/components/products/add-price-button.tsx`, `src/components/products/product-actions.tsx`
- Create: `src/app/products/[id]/page.tsx`, `src/app/products/[id]/error.tsx`
- Test: `src/lib/dates.test.ts`, `src/server/actions/prices.test.ts`, `src/components/common/entity-combobox.test.tsx`, `src/components/products/price-form.test.tsx`

**Interfaces:**
- Consumes: `latestPricesByStore` (Task 3), `parseEuros`, `formatEuros` (Task 1), `formatPerMeasure`, `formatPriceAge`, `formatSize` (Task 2), `listStores`, `StoreSummary`, `createStoreAction`, `StoreForm` (Task 8), `getProduct`, `ProductForm`, `updateProductAction`, `deleteProductAction`, `useFormAction`, `FieldError` (Task 9).
- Produces:
  - `todayIso(now?: Date): string` — the current date in Europe/Paris as `YYYY-MM-DD`.
  - `type StorePriceRow = { store: StoreSummary; priceCents: number; observedAt: Date; isCheapest: boolean }`
  - `listStorePrices(productId: string): Promise<StorePriceRow[]>` — latest price per store, cheapest first; the first row has `isCheapest: true`.
  - `addManualPrice(input: { productId: string; storeId: string; priceCents: number; observedAt: Date }): Promise<void>`
  - `addPriceAction(productId: string, prev: ActionState<null>, formData: FormData): Promise<ActionResult<null>>` — fields `storeId`, `price` (e.g. `"1,19"`), `observedAt` (`YYYY-MM-DD`).
  - `<EntityCombobox id name label options value onChange onCreate? placeholder errors? />` with `type ComboboxOption = { id: string; label: string; imageUrl?: string | null }` — reused for products and stores in Plans 2 and 3.

- [ ] **Step 1: Write and pass the date helper test**

Create `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { todayIso } from "./dates";

describe("todayIso", () => {
  it("uses the Paris calendar day", () => {
    expect(todayIso(new Date("2026-10-03T21:30:00Z"))).toBe("2026-10-03");
    expect(todayIso(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04");
  });
});
```

Run: `pnpm test src/lib/dates.test.ts` — Expected: FAIL (module missing). Create `src/lib/dates.ts`:

```ts
const parisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

export function todayIso(now: Date = new Date()): string {
  return parisDay.format(now);
}
```

Run again — Expected: PASS.

- [ ] **Step 2: Write the failing price tests**

Create `src/server/actions/prices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listStorePrices } from "@/server/repositories/prices";
import { addPriceAction } from "./prices";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function setup() {
  const product = await db().product.create({ data: { name: "Penne", sizeValue: 500, sizeUnit: "G" } });
  const [lidl, auchan] = await Promise.all(
    ["Lidl", "Auchan"].map((name) => db().store.create({ data: { name, nameKey: name.toLowerCase() } })),
  );
  if (!lidl || !auchan) throw new Error("setup failed");
  return { product, lidl, auchan };
}

describe("addPriceAction", () => {
  it("adds a manual price and updates the cheapest store", async () => {
    const { product, lidl, auchan } = await setup();
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,99", observedAt: "2026-10-01" }));
    const result = await addPriceAction(product.id, null, form({ storeId: auchan.id, price: "0,95 €", observedAt: "2026-10-02" }));
    expect(result).toEqual({ ok: true, data: null });

    const rows = await listStorePrices(product.id);
    expect(rows.map((r) => [r.store.name, r.priceCents, r.isCheapest])).toEqual([
      ["Auchan", 95, true],
      ["Lidl", 99, false],
    ]);
    expect(await db().priceObservation.findFirst({ where: { storeId: auchan.id } })).toMatchObject({ source: "MANUAL" });
  });

  it("shows only the latest price of a store", async () => {
    const { product, lidl } = await setup();
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,89", observedAt: "2026-09-01" }));
    await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "0,99", observedAt: "2026-10-01" }));
    expect((await listStorePrices(product.id)).map((r) => r.priceCents)).toEqual([99]);
  });

  it.each([
    [{ price: "abc" }, "price", "Indique un prix valide, par exemple 1,29."],
    [{ price: "0" }, "price", "Indique un prix valide, par exemple 1,29."],
    [{ storeId: "" }, "storeId", "Choisis un magasin."],
    [{ observedAt: "03/10/2026" }, "observedAt", "Indique une date valide."],
  ])("rejects %j", async (override, field, message) => {
    const { product, lidl } = await setup();
    const result = await addPriceAction(product.id, null, form({ storeId: lidl.id, price: "1,29", observedAt: "2026-10-01", ...override }));
    expect(result).toMatchObject({ ok: false, errors: { [field]: [message] } });
    expect(await db().priceObservation.count()).toBe(0);
  });

  it("reports a store that no longer exists", async () => {
    const { product } = await setup();
    const result = await addPriceAction(product.id, null, form({ storeId: "01999999-0000-7000-8000-000000000000", price: "1,29", observedAt: "2026-10-01" }));
    expect(result).toMatchObject({ ok: false, errors: { storeId: ["Ce magasin n'existe plus."] } });
  });
});
```

Run: `pnpm test src/server/actions/prices.test.ts`
Expected: FAIL, cannot resolve `@/server/repositories/prices`.

- [ ] **Step 3: Implement the repository, schema and action**

Create `src/server/repositories/prices.ts`:

```ts
import "server-only";
import { latestPricesByStore } from "@/domain/latest-prices";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { StoreSummary } from "./stores";

export type StorePriceRow = { store: StoreSummary; priceCents: number; observedAt: Date; isCheapest: boolean };

export class UnknownStoreError extends Error {}

export async function listStorePrices(productId: string): Promise<StorePriceRow[]> {
  const observations = await db().priceObservation.findMany({
    where: { productId },
    select: {
      storeId: true,
      priceCents: true,
      observedAt: true,
      createdAt: true,
      store: { select: { id: true, name: true, address: true, logoPath: true } },
    },
  });
  const stores = new Map(observations.map((o) => [o.storeId, o.store]));
  return latestPricesByStore(observations).map((price, index) => ({
    store: stores.get(price.storeId) as StoreSummary,
    priceCents: price.priceCents,
    observedAt: price.observedAt,
    isCheapest: index === 0,
  }));
}

export async function addManualPrice(input: {
  productId: string;
  storeId: string;
  priceCents: number;
  observedAt: Date;
}): Promise<void> {
  try {
    await db().priceObservation.create({ data: { ...input, source: "MANUAL" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") throw new UnknownStoreError();
    throw error;
  }
}
```

Create `src/server/actions/prices.schema.ts`:

```ts
import { z } from "zod";
import { parseEuros } from "@/domain/money";

export const priceInputSchema = z.object({
  storeId: z.uuid({ error: "Choisis un magasin." }),
  price: z
    .string()
    .transform((value) => parseEuros(value))
    .pipe(z.number({ error: "Indique un prix valide, par exemple 1,29." })),
  observedAt: z.iso.date({ error: "Indique une date valide." }).transform((value) => new Date(`${value}T00:00:00Z`)),
});
```

`parseEuros` returns `null` for invalid input, and `z.number()` rejects `null` with the French message.

Create `src/server/actions/prices.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { addManualPrice, UnknownStoreError } from "@/server/repositories/prices";
import { text } from "./form-data";
import { priceInputSchema } from "./prices.schema";
import { type ActionResult, type ActionState, invalid } from "./result";

export async function addPriceAction(
  productId: string,
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = priceInputSchema.safeParse({
    storeId: text(formData, "storeId"),
    price: text(formData, "price"),
    observedAt: text(formData, "observedAt"),
  });
  if (!parsed.success) return invalid(parsed.error);
  try {
    await addManualPrice({
      productId,
      storeId: parsed.data.storeId,
      priceCents: parsed.data.price,
      observedAt: parsed.data.observedAt,
    });
  } catch (error) {
    if (error instanceof UnknownStoreError) return { ok: false, errors: { storeId: ["Ce magasin n'existe plus."] } };
    throw error;
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true, data: null };
}
```

Run: `pnpm test src/server/actions/prices.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing combobox test**

Create `src/components/common/entity-combobox.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type ComboboxOption, EntityCombobox } from "./entity-combobox";

const stores: ComboboxOption[] = [
  { id: "lidl", label: "Lidl Lomme" },
  { id: "leclerc", label: "Leclerc Templeuve" },
];

function Harness({ onCreate }: { onCreate?: (query: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <form aria-label="test">
      <EntityCombobox id="store" name="storeId" label="Magasin" options={stores} value={value} onChange={setValue}
        onCreate={onCreate} placeholder="Choisir un magasin" />
    </form>
  );
}

describe("EntityCombobox", () => {
  it("selects an option found by typing and stores its id in the form", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "lecl");
    await userEvent.click(screen.getByRole("option", { name: "Leclerc Templeuve" }));
    expect(screen.getByRole("combobox", { name: "Magasin" })).toHaveTextContent("Leclerc Templeuve");
    const form = screen.getByRole("form", { name: "test" }) as HTMLFormElement;
    expect(new FormData(form).get("storeId")).toBe("leclerc");
  });

  it("offers to create what was typed when nothing matches exactly", async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.type(screen.getByPlaceholderText("Rechercher…"), "Auchan V2");
    await userEvent.click(screen.getByRole("option", { name: "Créer « Auchan V2 »" }));
    expect(onCreate).toHaveBeenCalledWith("Auchan V2");
  });
});
```

Run: `pnpm test src/components/common/entity-combobox.test.tsx`
Expected: FAIL, cannot resolve `./entity-combobox`.

- [ ] **Step 5: Implement the combobox**

Create `src/components/common/entity-combobox.tsx`:

```tsx
"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FieldError } from "./field-error";

export type ComboboxOption = { id: string; label: string; imageUrl?: string | null };

type Props = {
  id: string;
  name: string;
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (id: string) => void;
  onCreate?: (query: string) => void;
  placeholder: string;
  errors?: string[];
};

export function EntityCombobox({ id, name, label, options, value, onChange, onCreate, placeholder, errors }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value);
  const trimmed = query.trim();
  const exactMatch = options.some((option) => option.label.toLocaleLowerCase("fr-FR") === trimmed.toLocaleLowerCase("fr-FR"));

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value ?? ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open}
            aria-invalid={errors ? true : undefined} aria-describedby={`${id}-error`}
            className="h-11 w-full justify-between bg-card px-3 text-base font-normal">
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher…" value={query} onValueChange={setQuery} className="text-base" />
            <CommandList>
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.label} onSelect={() => { onChange(option.id); setOpen(false); }} className="min-h-11">
                    {option.imageUrl && <img src={option.imageUrl} alt="" className="size-6 rounded-sm object-cover" />}
                    <span className="flex-1">{option.label}</span>
                    {option.id === value && <Check className="size-4" aria-hidden />}
                  </CommandItem>
                ))}
                {onCreate && trimmed && !exactMatch && (
                  <CommandItem value={`__create__${trimmed}`} forceMount onSelect={() => { onCreate(trimmed); setOpen(false); }}
                    className="min-h-11 font-semibold text-primary">
                    <Plus className="size-4" aria-hidden />
                    {`Créer « ${trimmed} »`}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FieldError id={`${id}-error`} errors={errors} />
    </div>
  );
}
```

`forceMount` keeps the "Créer" item visible whatever cmdk's fuzzy filter decides.

Run: `pnpm test src/components/common/entity-combobox.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing price form test**

Create `src/components/products/price-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceForm } from "./price-form";

const product = { id: "p1", name: "Penne", brand: "Barilla", photoPath: null, sizeValue: 500, sizeUnit: "G" as const, bestPriceCents: 99 };
const stores = [{ id: "lidl", name: "Lidl", address: null, logoPath: null }];
const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

describe("PriceForm", () => {
  it("shows the price per kilo while typing", async () => {
    render(<PriceForm product={product} stores={stores} action={vi.fn()} createStore={vi.fn()} onDone={vi.fn()} today="2026-10-03" />);
    await userEvent.type(screen.getByLabelText("Prix"), "1,19");
    expect(plain(screen.getByTestId("per-measure").textContent)).toBe("= 2,38 €/kg");
  });

  it("defaults the date to today and sends the chosen store", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: null });
    const onDone = vi.fn();
    render(<PriceForm product={product} stores={stores} action={action} createStore={vi.fn()} onDone={onDone} today="2026-10-03" />);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-03");
    await userEvent.click(screen.getByRole("combobox", { name: "Magasin" }));
    await userEvent.click(screen.getByRole("option", { name: "Lidl" }));
    await userEvent.type(screen.getByLabelText("Prix"), "0,99");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    const sent: FormData = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(sent)).toEqual({ storeId: "lidl", price: "0,99", observedAt: "2026-10-03" });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
```

Run: `pnpm test src/components/products/price-form.test.tsx`
Expected: FAIL, cannot resolve `./price-form`.

- [ ] **Step 7: Implement the price form**

Create `src/components/products/price-form.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { FieldError } from "@/components/common/field-error";
import { SubmitButton } from "@/components/common/submit-button";
import { useFormAction } from "@/components/common/use-form-action";
import { StoreForm } from "@/components/stores/store-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEuros } from "@/domain/money";
import { formatPerMeasure } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import type { ActionResult, ActionState } from "@/server/actions/result";
import type { ProductSummary } from "@/server/repositories/products";
import type { StoreSummary } from "@/server/repositories/stores";

type Props = {
  product: ProductSummary;
  stores: StoreSummary[];
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionResult<null>>;
  createStore: (prev: ActionState<StoreSummary>, formData: FormData) => Promise<ActionResult<StoreSummary>>;
  onDone: () => void;
  today: string;
};

export function PriceForm({ product, stores: initialStores, action, createStore, onDone, today }: Props) {
  const [stores, setStores] = useState(initialStores);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [observedAt, setObservedAt] = useState(today);
  const [newStoreName, setNewStoreName] = useState<string | null>(null);
  const done = useCallback(() => onDone(), [onDone]);
  const { errors, pending, onSubmit } = useFormAction(action, done);
  const cents = parseEuros(price);

  const storeCreated = useCallback((store: StoreSummary) => {
    setStores((current) => [...current, store].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    setStoreId(store.id);
    setNewStoreName(null);
  }, []);

  if (newStoreName !== null) {
    return (
      <div className="grid gap-3">
        <StoreForm action={createStore} defaultName={newStoreName} onDone={storeCreated} />
        <Button type="button" variant="ghost" onClick={() => setNewStoreName(null)}>Retour au prix</Button>
      </div>
    );
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <EntityCombobox id="storeId" name="storeId" label="Magasin" placeholder="Choisir un magasin"
        options={stores.map((s) => ({ id: s.id, label: s.name, imageUrl: s.logoPath ? uploadUrl(s.logoPath, { thumb: true }) : null }))}
        value={storeId} onChange={setStoreId} onCreate={setNewStoreName} errors={errors.storeId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="price">Prix</Label>
          <Input id="price" name="price" inputMode="decimal" className="font-mono" value={price} onChange={(e) => setPrice(e.target.value)}
            aria-invalid={errors.price ? true : undefined} aria-describedby="price-error" />
          <p data-testid="per-measure" className="text-xs text-muted-foreground">
            {cents ? `= ${formatPerMeasure(cents, product.sizeValue, product.sizeUnit)}` : " "}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observedAt">Date</Label>
          <Input id="observedAt" name="observedAt" type="date" className="font-mono" value={observedAt} max={today}
            onChange={(e) => setObservedAt(e.target.value)} aria-invalid={errors.observedAt ? true : undefined} aria-describedby="observedAt-error" />
        </div>
      </div>
      <FieldError id="price-error" errors={errors.price} />
      <FieldError id="observedAt-error" errors={errors.observedAt} />
      <SubmitButton pending={pending}>Ajouter</SubmitButton>
    </form>
  );
}
```

Run: `pnpm test src/components/products/price-form.test.tsx`
Expected: PASS.

- [ ] **Step 8: Build the product detail page**

Create `src/components/products/price-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { formatEuros } from "@/domain/money";
import { formatPerMeasure, formatPriceAge } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type { ProductSummary } from "@/server/repositories/products";
import type { StorePriceRow } from "@/server/repositories/prices";

export function PriceTable({ product, rows, now }: { product: ProductSummary; rows: StorePriceRow[]; now: Date }) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed bg-card p-4 text-sm text-muted-foreground">Aucun prix relevé pour ce produit.</p>;
  }
  return (
    <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
      <thead className="sr-only lg:not-sr-only">
        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-3 py-2 font-semibold">Magasin</th>
          <th className="hidden px-3 py-2 font-semibold lg:table-cell">Relevé</th>
          <th className="px-3 py-2 text-right font-semibold">Prix</th>
          <th className="hidden px-3 py-2 text-right font-semibold lg:table-cell">Prix unitaire</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dashed">
        {rows.map(({ store, priceCents, observedAt, isCheapest }) => (
          <tr key={store.id} className={cn(isCheapest && "bg-savings-soft")}>
            <td className="px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-xs font-bold text-primary">
                  {store.logoPath ? <img src={uploadUrl(store.logoPath, { thumb: true })} alt="" className="size-full object-cover" /> : store.name[0]}
                </div>
                <div>
                  <span className="font-medium">{store.name}</span>
                  {isCheapest && <Badge className="ml-2 bg-savings text-white">Moins cher</Badge>}
                  <span className="block text-xs text-muted-foreground lg:hidden">{formatPriceAge(observedAt, now)}</span>
                </div>
              </div>
            </td>
            <td className="hidden px-3 text-muted-foreground lg:table-cell">{formatPriceAge(observedAt, now)}</td>
            <td className="px-3 text-right font-mono font-bold">
              {formatEuros(priceCents)}
              <span className="block text-xs font-medium text-muted-foreground lg:hidden">{formatPerMeasure(priceCents, product.sizeValue, product.sizeUnit)}</span>
            </td>
            <td className="hidden px-3 text-right font-mono lg:table-cell">{formatPerMeasure(priceCents, product.sizeValue, product.sizeUnit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `src/components/products/add-price-button.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/format";
import { addPriceAction } from "@/server/actions/prices";
import { createStoreAction } from "@/server/actions/stores";
import type { ProductSummary } from "@/server/repositories/products";
import type { StoreSummary } from "@/server/repositories/stores";
import { PriceForm } from "./price-form";

export function AddPriceButton({ product, stores, today }: { product: ProductSummary; stores: StoreSummary[]; today: string }) {
  const [open, setOpen] = useState(false);
  const done = useCallback(() => {
    toast.success("Prix ajouté");
    setOpen(false);
  }, []);
  return (
    <>
      <Button variant="outline" className="h-11 w-full border-dashed border-primary text-primary" onClick={() => setOpen(true)}>
        + Ajouter un prix
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Ajouter un prix"
        description={[product.name, product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}>
        <PriceForm product={product} stores={stores} action={addPriceAction.bind(null, product.id)} createStore={createStoreAction} onDone={done} today={today} />
      </ResponsiveDialog>
    </>
  );
}
```

Create `src/components/products/product-actions.tsx`:

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { deleteProductAction, updateProductAction } from "@/server/actions/products";
import type { ProductSummary } from "@/server/repositories/products";
import { ProductForm } from "./product-form";

export function ProductActions({ product }: { product: ProductSummary }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!window.confirm(`Supprimer « ${product.name} » et ses prix ?`)) return;
    const result = await deleteProductAction(product.id);
    if (!result.ok) return toast.error(result.message ?? "Suppression impossible");
    toast.success("Produit supprimé");
    router.push("/products");
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="icon" className="size-11" aria-label="Modifier le produit" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
      </Button>
      <Button variant="outline" size="icon" className="size-11" aria-label="Supprimer le produit" onClick={remove}>
        <Trash2 aria-hidden />
      </Button>
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title="Modifier le produit">
        <ProductForm action={updateProductAction.bind(null, product.id)} product={product}
          onDone={() => { toast.success("Produit enregistré"); setEditing(false); }} />
      </ResponsiveDialog>
    </div>
  );
}
```

Create `src/app/products/[id]/page.tsx` (the alternatives section is added in Task 11):

```tsx
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddPriceButton } from "@/components/products/add-price-button";
import { PriceTable } from "@/components/products/price-table";
import { ProductActions } from "@/components/products/product-actions";
import { todayIso } from "@/lib/dates";
import { formatSize } from "@/lib/format";
import { uploadUrl } from "@/lib/uploads";
import { listStorePrices } from "@/server/repositories/prices";
import { getProduct } from "@/server/repositories/products";
import { listStores } from "@/server/repositories/stores";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).id);
  return { title: product?.name ?? "Produit" };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const [product, prices, stores] = await Promise.all([getProduct(id), listStorePrices(id), listStores()]);
  if (!product) notFound();
  const now = new Date();

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <Link href="/products" className="flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" aria-hidden /> Produits
        </Link>
        <ProductActions product={product} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr] lg:items-start">
        <div className="grid gap-2">
          <div className="aspect-[4/3] overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)] lg:aspect-square">
            {product.photoPath && <img src={uploadUrl(product.photoPath)} alt={product.name} className="size-full object-cover" />}
          </div>
          <h1 className="text-2xl leading-tight">{product.name}</h1>
          <p className="text-muted-foreground">{[product.brand, formatSize(product.sizeValue, product.sizeUnit)].filter(Boolean).join(" · ")}</p>
        </div>
        <section aria-labelledby="prices-title" className="grid gap-2">
          <h2 id="prices-title" className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix par magasin</h2>
          <PriceTable product={product} rows={prices} now={now} />
          <AddPriceButton product={product} stores={stores} today={todayIso(now)} />
        </section>
      </div>
    </div>
  );
}
```

Create `src/app/products/[id]/error.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl">Impossible d'afficher ce produit</h1>
      <div className="flex gap-2">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" asChild><Link href="/products">Tous les produits</Link></Button>
      </div>
    </div>
  );
}
```

An invalid UUID in the URL (e.g. `/products/abc`) makes PostgreSQL reject the query, which would show the error page instead of "Page introuvable". Guard it test-first. Add to `src/server/actions/products.test.ts`:

```ts
  it("treats a malformed id as not found", async () => {
    expect(await getProduct("not-a-uuid")).toBeNull();
  });
```

and to `src/server/actions/prices.test.ts`:

```ts
  it("returns no prices for a malformed product id", async () => {
    expect(await listStorePrices("not-a-uuid")).toEqual([]);
  });
```

Run: `pnpm test --project integration` — Expected: both new tests FAIL with a database error.

Create `src/lib/ids.ts`:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
```

In `src/server/repositories/products.ts`, add `import { isUuid } from "@/lib/ids";` and make the first line of `getProduct` `if (!isUuid(id)) return null;`. In `src/server/repositories/prices.ts`, add the same import and make the first line of `listStorePrices` `if (!isUuid(productId)) return [];`.

Run: `pnpm test` — Expected: PASS.

- [ ] **Step 9: Visual check, verify and commit**

Run `pnpm dev`, open a product at 375 px and 1280 px: add prices in two stores (create one from the combobox), check the cheapest badge and price per kilo, edit and delete the product. Compare with the fiche produit mockups (`01-visual-direction.html` B, desktop screen 3), show the user and wait for their go-ahead.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat(products): compare latest prices per store and add manual prices"
```

---

### Task 11: Alternatives

**Files:**
- Create: `src/server/repositories/alternatives.ts`, `src/server/actions/alternatives.ts`
- Create: `src/components/products/alternatives-carousel.tsx`, `src/components/products/add-alternative.tsx`
- Modify: `src/app/products/[id]/page.tsx`
- Test: `src/server/actions/alternatives.test.ts`

**Interfaces:**
- Consumes: `rankAlternatives`, `RankedAlternative` (Task 4), `ProductSummary`, `listProducts` (Task 9), `EntityCombobox` (Task 10), `isUuid` (Task 10).
- Produces:
  - `listAlternatives(productId: string): Promise<ProductSummary[]>` — both directions of the symmetric link.
  - `linkAlternative(productId: string, otherId: string): Promise<void>` — stores the pair once (smaller ID first); linking an existing pair is a no-op; throws `SelfAlternativeError` when both IDs are equal.
  - `unlinkAlternative(productId: string, otherId: string): Promise<void>`
  - Actions: `addAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>>`, `removeAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>>`.

- [ ] **Step 1: Write the failing tests**

Create `src/server/actions/alternatives.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listAlternatives } from "@/server/repositories/alternatives";
import { addAlternativeAction, removeAlternativeAction } from "./alternatives";

async function product(name: string) {
  return db().product.create({ data: { name, sizeValue: 500, sizeUnit: "G" } });
}

describe("alternatives", () => {
  it("links two products both ways with a single row", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    expect(await addAlternativeAction(penne.id, combino.id)).toEqual({ ok: true, data: null });
    expect((await listAlternatives(penne.id)).map((p) => p.name)).toEqual(["Combino"]);
    expect((await listAlternatives(combino.id)).map((p) => p.name)).toEqual(["Penne"]);
    expect(await db().productAlternative.count()).toBe(1);
  });

  it("ignores a link that already exists in either direction", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    expect(await addAlternativeAction(combino.id, penne.id)).toEqual({ ok: true, data: null });
    expect(await db().productAlternative.count()).toBe(1);
  });

  it("refuses to make a product its own alternative", async () => {
    const penne = await product("Penne");
    expect(await addAlternativeAction(penne.id, penne.id)).toMatchObject({ ok: false, message: "Un produit ne peut pas être sa propre alternative." });
  });

  it("removes a link from either side", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    await removeAlternativeAction(combino.id, penne.id);
    expect(await listAlternatives(penne.id)).toEqual([]);
  });

  it("drops the link when a product is deleted", async () => {
    const [penne, combino] = [await product("Penne"), await product("Combino")];
    await addAlternativeAction(penne.id, combino.id);
    await db().product.delete({ where: { id: combino.id } });
    expect(await listAlternatives(penne.id)).toEqual([]);
  });
});
```

Run: `pnpm test src/server/actions/alternatives.test.ts`
Expected: FAIL, cannot resolve `@/server/repositories/alternatives`.

- [ ] **Step 2: Implement repository and actions**

To reuse the product summary mapping, export `withPrices` and `toSummary` from `src/server/repositories/products.ts` (change `const withPrices` to `export const withPrices` and `function toSummary` to `export function toSummary`).

Create `src/server/repositories/alternatives.ts`:

```ts
import "server-only";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db";
import { type ProductSummary, toSummary, withPrices } from "./products";

export class SelfAlternativeError extends Error {}

function orderedPair(a: string, b: string): { productAId: string; productBId: string } {
  return a < b ? { productAId: a, productBId: b } : { productAId: b, productBId: a };
}

export async function listAlternatives(productId: string): Promise<ProductSummary[]> {
  if (!isUuid(productId)) return [];
  const links = await db().productAlternative.findMany({
    where: { OR: [{ productAId: productId }, { productBId: productId }] },
    select: { productA: { select: withPrices }, productB: { select: withPrices } },
  });
  return links.map((link) => toSummary(link.productA.id === productId ? link.productB : link.productA));
}

export async function linkAlternative(productId: string, otherId: string): Promise<void> {
  if (productId === otherId) throw new SelfAlternativeError();
  const pair = orderedPair(productId, otherId);
  await db().productAlternative.upsert({ where: { productAId_productBId: pair }, create: pair, update: {} });
}

export async function unlinkAlternative(productId: string, otherId: string): Promise<void> {
  await db().productAlternative.deleteMany({ where: orderedPair(productId, otherId) });
}
```

Create `src/server/actions/alternatives.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { linkAlternative, SelfAlternativeError, unlinkAlternative } from "@/server/repositories/alternatives";
import { type ActionResult, failure } from "./result";

function revalidate(...ids: string[]) {
  for (const id of ids) revalidatePath(`/products/${id}`);
}

export async function addAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>> {
  try {
    await linkAlternative(productId, otherId);
  } catch (error) {
    if (error instanceof SelfAlternativeError) return failure("Un produit ne peut pas être sa propre alternative.");
    throw error;
  }
  revalidate(productId, otherId);
  return { ok: true, data: null };
}

export async function removeAlternativeAction(productId: string, otherId: string): Promise<ActionResult<null>> {
  await unlinkAlternative(productId, otherId);
  revalidate(productId, otherId);
  return { ok: true, data: null };
}
```

Run: `pnpm test src/server/actions/alternatives.test.ts`
Expected: PASS.

- [ ] **Step 3: Build the carousel and the add dialog**

Create `src/components/products/alternatives-carousel.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RankedAlternative } from "@/domain/alternatives";
import { formatEuros } from "@/domain/money";
import { measureLabel } from "@/domain/unit-price";
import { uploadUrl } from "@/lib/uploads";
import { removeAlternativeAction } from "@/server/actions/alternatives";
import type { ProductSummary } from "@/server/repositories/products";

type Item = RankedAlternative & Pick<ProductSummary, "name" | "photoPath">;

export function AlternativesCarousel({ productId, items }: { productId: string; items: Item[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune alternative pour l'instant.</p>;
  }
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 lg:mx-0 lg:px-0">
      {items.map((item) => (
        <li key={item.id} className="relative w-36 shrink-0 snap-start rounded-md border bg-card p-2">
          <Link href={`/products/${item.id}`} className="grid gap-1">
            <div className="h-20 overflow-hidden rounded-sm bg-[repeating-linear-gradient(45deg,#f5ebdd_0_8px,#efe3d1_8px_16px)]">
              {item.photoPath && <img src={uploadUrl(item.photoPath, { thumb: true })} alt="" loading="lazy" className="size-full object-cover" />}
            </div>
            <span className="text-sm font-semibold leading-tight">{item.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {item.perMeasureCents === null ? "Pas de prix" : `${formatEuros(Math.round(item.perMeasureCents))}/${measureLabel(item.sizeUnit)}`}
            </span>
            {item.discountPercent !== null && <Badge className="w-fit bg-savings text-white">−{item.discountPercent} %</Badge>}
          </Link>
          <Button variant="ghost" size="icon" className="absolute top-0 right-0 size-11" aria-label={`Retirer ${item.name} des alternatives`}
            onClick={async () => {
              await removeAlternativeAction(productId, item.id);
              toast.success("Alternative retirée");
            }}>
            <X className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

Create `src/components/products/add-alternative.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EntityCombobox } from "@/components/common/entity-combobox";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/uploads";
import { addAlternativeAction } from "@/server/actions/alternatives";
import type { ProductSummary } from "@/server/repositories/products";

export function AddAlternative({ productId, candidates }: { productId: string; candidates: ProductSummary[] }) {
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState<string | null>(null);

  async function add() {
    if (!otherId) return;
    const result = await addAlternativeAction(productId, otherId);
    if (!result.ok) return toast.error(result.message ?? "Ajout impossible");
    toast.success("Alternative ajoutée");
    setOtherId(null);
    setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" className="h-11 text-primary" onClick={() => setOpen(true)}>+ Ajouter une alternative</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Ajouter une alternative">
        <div className="grid gap-4">
          <EntityCombobox id="alternative" name="alternativeId" label="Produit" placeholder="Choisir un produit"
            options={candidates.map((p) => ({ id: p.id, label: [p.name, p.brand].filter(Boolean).join(" · "), imageUrl: p.photoPath ? uploadUrl(p.photoPath, { thumb: true }) : null }))}
            value={otherId} onChange={setOtherId} />
          <Button className="h-11" disabled={!otherId} onClick={add}>Ajouter</Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
```

- [ ] **Step 4: Show alternatives on the product page**

In `src/app/products/[id]/page.tsx`:

1. Add imports:

```tsx
import { AddAlternative } from "@/components/products/add-alternative";
import { AlternativesCarousel } from "@/components/products/alternatives-carousel";
import { rankAlternatives } from "@/domain/alternatives";
import { listAlternatives } from "@/server/repositories/alternatives";
import { listProducts } from "@/server/repositories/products";
```

2. Load them with the other data:

```tsx
  const [product, prices, stores, alternatives, allProducts] = await Promise.all([
    getProduct(id),
    listStorePrices(id),
    listStores(),
    listAlternatives(id),
    listProducts(),
  ]);
```

3. After `if (!product) notFound();`, compute:

```tsx
  const byId = new Map(alternatives.map((alt) => [alt.id, alt]));
  const ranked = rankAlternatives(product, alternatives).map((alt) => {
    const source = byId.get(alt.id) as (typeof alternatives)[number];
    return { ...alt, name: source.name, photoPath: source.photoPath };
  });
  const linkedIds = new Set([product.id, ...alternatives.map((alt) => alt.id)]);
  const candidates = allProducts.filter((p) => !linkedIds.has(p.id));
```

4. Inside the prices `<section>`, after `<AddPriceButton … />`, add:

```tsx
          <div className="mt-4 flex items-center justify-between">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alternatives</h2>
            <AddAlternative productId={product.id} candidates={candidates} />
          </div>
          <AlternativesCarousel productId={product.id} items={ranked} />
```

`rankAlternatives` accepts `ProductSummary` directly because it is structurally a `ProductPricing`.

- [ ] **Step 5: Visual check, verify and commit**

Run `pnpm dev`: link a cheaper 1 kg pack to a 500 g product and check the "−20 %" badge, the link from the other product, swipe the carousel on 375 px, and remove a link. Show the user and wait for their go-ahead.

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

```bash
git add -A
git commit -m "feat(products): link alternative products and rank them by unit price"
```

---

### Task 12: Docker deployment and end-to-end test

**Files:**
- Create: `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`, `docker-compose.yml`, `README.md`
- Create: `playwright.config.ts`, `scripts/e2e-server.sh`, `tests/e2e/catalog.spec.ts`
- Modify: `next.config.ts`, `.gitignore`

**Interfaces:**
- Consumes: the whole app from Tasks 1–11.
- Produces: `docker compose up -d --build` runs cabas on `APP_PORT` with migrations applied at start; `pnpm test:e2e` runs the catalog flow on a mobile (Pixel 7) and a desktop project against the production build.

- [ ] **Step 1: Enable the standalone output**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Write the end-to-end test first**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Create `scripts/e2e-server.sh`:

```sh
#!/bin/sh
# Builds and serves the production app against a throwaway database for Playwright.
set -e
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://cabas:change-me@localhost:5432/cabas_e2e}"
export UPLOADS_DIR="$(mktemp -d)"
pnpm prisma migrate reset --force
pnpm build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
PORT=3100 HOSTNAME=127.0.0.1 exec node .next/standalone/server.js
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", locale: "fr-FR", timezoneId: "Europe/Paris", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "sh scripts/e2e-server.sh",
    url: "http://127.0.0.1:3100",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

Create `tests/e2e/catalog.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("add prices to a new product and see the cheapest store", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name;
  const product = `Penne Rigate ${suffix}`;

  await page.goto("/products");
  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.getByLabel("Nom").fill(product);
  await page.getByLabel("Marque").fill("Barilla");
  await page.getByLabel("Contenance").fill("500");
  await page.getByLabel("Unité").selectOption("G");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: product })).toBeVisible();

  for (const [store, price] of [[`Lidl ${suffix}`, "0,99"], [`Auchan ${suffix}`, "0,89"]] as const) {
    await page.getByRole("button", { name: "+ Ajouter un prix" }).click();
    await page.getByRole("combobox", { name: "Magasin" }).click();
    await page.getByPlaceholder("Rechercher…").fill(store);
    await page.getByRole("option", { name: `Créer « ${store} »` }).click();
    await expect(page.getByLabel("Nom")).toHaveValue(store);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("combobox", { name: "Magasin" })).toHaveText(store);
    await page.getByLabel("Prix").fill(price);
    await expect(page.getByText(/= \d,\d{2}\s€\/kg/)).toBeVisible();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("Prix ajouté")).toBeVisible();
  }

  const cheapestRow = page.getByRole("row").filter({ hasText: "Moins cher" });
  await expect(cheapestRow).toContainText(`Auchan ${suffix}`);
  await expect(cheapestRow).toContainText("1,78");

  await page.goto(`/products?q=${encodeURIComponent(product)}`);
  await expect(page.getByText(/dès 0,89/)).toBeVisible();
});
```

Add `test-results/`, `playwright-report/` and `.next/` to `.gitignore` if missing.

- [ ] **Step 3: Run the end-to-end test**

The dev database from Task 5 must be running (`docker compose -f docker-compose.dev.yml --env-file .env up -d`).

Run: `pnpm test:e2e`
Expected: PASS on `mobile` and `desktop`. If a step fails, open the trace (`pnpm exec playwright show-trace test-results/…/trace.zip`) and fix the app, not the test, unless the test contradicts the spec.

- [ ] **Step 4: Write the production image**

Create `.dockerignore`:

```
node_modules
.next
.git
.superpowers
uploads
.env
.env.*
!.env.example
test-results
playwright-report
src/generated
```

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
ARG PRISMA_VERSION=7

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma generate && pnpm build

# Minimal toolchain to run `prisma migrate deploy` at container start.
FROM base AS migrator
ARG PRISMA_VERSION
WORKDIR /opt/migrate
COPY prisma ./prisma
COPY prisma.config.ts pnpm-workspace.yaml ./
RUN echo '{"name":"cabas-migrate","private":true}' > package.json \
  && pnpm add "prisma@${PRISMA_VERSION}" dotenv

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=migrator --chown=node:node /opt/migrate /opt/migrate
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
```

Create `docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e
cd /opt/migrate
./node_modules/.bin/prisma migrate deploy
cd /app
exec node server.js
```

Create `docker-compose.yml`:

```yaml
services:
  app:
    build: .
    image: cabas:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      UPLOADS_DIR: /data/uploads
      TZ: ${TZ:-Europe/Paris}
    ports:
      - "${APP_PORT:-3000}:3000"
    volumes:
      - uploads:/data/uploads
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s

  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: ${TZ:-Europe/Paris}
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  uploads:
```

The `db` service publishes no port: only `app` reaches it over the compose network.

- [ ] **Step 5: Run the stack**

Stop the dev database first if it uses port 5432 on the same host (`docker compose -f docker-compose.dev.yml down`), then:

Run: `docker compose --env-file .env up -d --build && docker compose ps`
Expected: `db` healthy, `app` healthy after ~30 s; the logs (`docker compose logs app`) show the migrations applied. Open http://localhost:3000, create a product with a photo and a price, then `docker compose restart app` and check that the product and its photo are still there.

- [ ] **Step 6: Document running and deploying**

Create `README.md`:

````markdown
# cabas

Self-hosted, mobile-first app to record grocery purchases, compare prices across stores
and plan shopping lists. Single user, meant to be reached through a private network
(NetBird). See [`docs/superpowers/specs/2026-10-03-cabas-design.md`](docs/superpowers/specs/2026-10-03-cabas-design.md).

## Development

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml --env-file .env up -d   # PostgreSQL on localhost:5432
pnpm install
pnpm prisma migrate dev
pnpm dev
```

Checks: `pnpm lint && pnpm typecheck && pnpm test` (integration tests start their own
PostgreSQL container, so Docker must be running). End-to-end: `pnpm test:e2e`.

## Deployment (homelab)

```bash
cp .env.example .env    # set a strong POSTGRES_PASSWORD and APP_PORT
docker compose --env-file .env up -d --build
```

Migrations run automatically when the `app` container starts. Data lives in two named
volumes: `pgdata` (database) and `uploads` (photos).
````

- [ ] **Step 7: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all pass.

```bash
git add -A
git commit -m "build: add production docker stack, e2e catalog test and readme"
```

---

## Plan completion checklist

- [ ] All 12 tasks committed on a `feat/foundation-catalog` branch; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` green.
- [ ] `docker compose up -d --build` works from a clean checkout with only `.env` filled in.
- [ ] The user reviewed each screen (stores, products grid, product detail with prices and alternatives) at 375 px and 1280 px.
- [ ] Update `CLAUDE.md` "Commands" if any script changed, then write Plan 2 (Purchases) from the roadmap against the merged code.
