# cabas — Dashboard and release

- **Date:** 2026-10-09
- **Status:** Draft, awaiting review
- **Branch:** `feat/dashboard`
- **Implements:** [`2026-10-03-cabas-design.md`](2026-10-03-cabas-design.md) §2 (PWA manifest),
  §3 (backup), §5.6, §6.3, and [`2026-10-08-promotions-design.md`](2026-10-08-promotions-design.md) §8
- **Roadmap:** plan 4, "Dashboard & release"

## 1. Purpose

The home page (`/`) is still a placeholder. This change turns it into the monthly dashboard
described in the main spec, makes the app installable to the home screen, and documents how
to back up and restore the data.

### Success criteria

- Opening the app shows, for the current month, what was spent, how it compares with the
  previous month, how many purchases were made, and how much was saved.
- Any earlier month can be reached with the month selector, and the URL (`?month=YYYY-MM`)
  can be bookmarked.
- The statistics match §5.6 of the main spec exactly; they are computed by pure, unit-tested
  domain functions.
- The app can be added to the home screen on iOS and Android and opens without browser
  chrome.
- One documented command produces a database dump and an archive of the uploaded images,
  and the README explains how to restore them.

### Out of scope

- Offline mode and service worker (the main spec rules out offline use).
- Statistics on shopping lists (plan 3 is not built yet).
- Date ranges other than a calendar month, and exports (CSV, PDF).
- Automatic scheduling or rotation of backups: the user schedules the command with cron.

## 2. Decisions

| Topic | Decision |
|-------|----------|
| Where statistics are computed | In the **domain** (`src/domain/statistics.ts`), from rows loaded by a repository. No aggregation logic in SQL, so net line amounts and promotions are computed by the same code as everywhere else. |
| Selected month | `?month=YYYY-MM`. Missing, invalid or future values fall back to the **current month in Europe/Paris**. |
| Top products by spend | Uses **net** line amounts (`lineNet`). |
| Savings vs highest price | Uses the **regular** `unitPriceCents`, so promotion discounts are never counted twice. |
| Change vs previous month colour | Neutral (ink), never green or red: spending more or less is not judged. |
| 12-month chart | Recharts (`"use client"`). |
| Spend per store | Horizontal bars in plain CSS, no chart library. |
| Top products toggle | Both rankings are computed on the server; the toggle only switches which one is shown. |
| PWA | Web app manifest only, no service worker. The manifest and install icons are public paths. |
| Backup | `scripts/backup.sh`, documented in the README with a cron example and restore steps. |

## 3. Statistics

All rules come from §5.6 of the main spec. Months are calendar months; purchase dates are
`@db.Date` values, so `monthKey(purchasedAt)` (`src/lib/purchase-months.ts`) gives the month
without timezone conversion.

### 3.1 Month helpers (`src/lib/months.ts`)

- `currentMonth(now)`: the `YYYY-MM` of `todayIso(now)` (Europe/Paris).
- `parseMonth(value, now)`: a valid `YYYY-MM` not after the current month, otherwise the
  current month. Validated with Zod.
- `previousMonth(month)`, `nextMonth(month)`.
- `lastTwelveMonths(month)`: the 12 months ending with `month`, oldest first.
- `monthRange(month)`: the first day of the month and the first day of the next month, as
  UTC-midnight dates, for `purchasedAt >= start AND purchasedAt < end` queries.

### 3.2 Domain types (`src/domain/statistics.ts`)

The domain receives plain objects; it knows nothing about Prisma.

```ts
type StatLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  promo: Promo | null;
};

type StatPurchase = {
  purchasedAt: Date;
  storeId: string;
  storeName: string;
  totalCents: number;
  lines: StatLine[];
};

type ProductObservation = PriceObservationInput & { productId: string };

type MonthTotal = { month: string; totalCents: number };
```

### 3.3 Domain functions

Each function has its own unit tests.

| Function | Result |
|----------|--------|
| `totalSpent(purchases)` | Sum of `totalCents`. |
| `changeVsPrevious(currentCents, previousCents)` | `round((current − previous) / previous × 100)`, or `null` when `previous` is 0 (no purchases, or only zero totals). |
| `averageBasket(totalCents, count)` | `round(total / count)` half up; 0 when `count` is 0. |
| `topProducts(purchases, by, limit = 5)` | Per product: spend = sum of `lineNet(line)`, quantity = sum of `quantity`. Sorted descending on `by` (`"spend"` or `"quantity"`), ties broken by product name (`localeCompare` `fr`). |
| `spendPerStore(purchases)` | Per store: sum of `totalCents`, sorted descending, ties by store name. |
| `promotionSavings(purchases)` | Sum of `sumOfDiscounts(lines)` over all purchases. |
| `savingsVsHighestPrice(purchases, observations)` | See §3.4. |
| `fillMonths(months, totals)` | One `MonthTotal` per month of `months`, 0 where `totals` has no entry. |

`topProducts` returns `{ productId, productName, spendCents, quantity }`; `spendPerStore`
returns `{ storeId, storeName, totalCents }`.

### 3.4 Savings vs highest price

For each line of each purchase of the month:

1. Keep the observations of the line's product with `observedAt ≤ purchasedAt` (this
   includes the observation created by the purchase itself).
2. `latestPricesByStore` (existing, `src/domain/latest-prices.ts`) gives each store's
   current price as of that date.
3. If fewer than two stores have a price, the line contributes 0.
4. `reference` = the highest of those prices.
5. `saved = multiplyByQuantity(quantity, max(0, reference − unitPriceCents))`.

The result is the sum over all lines. Lines are independent: a product bought twice in the
month is evaluated against each purchase's own date.

### Examples

Product P, bought on 2026-10-10, quantity 2, regular unit price 1,00 €.

| Observations of P up to 2026-10-10 | Saved |
|------------------------------------|-------|
| Store A 1,00 € (this purchase) only | 0 (one store) |
| A 1,00 €, B 1,30 € | 0,60 € |
| A 1,00 €, B 1,30 € on 01/10 then 1,10 € on 05/10 | 0,20 € (B's latest is 1,10 €) |
| A 1,00 €, B 1,30 € observed on 2026-10-12 | 0 (B's price is after the purchase) |
| A 1,00 €, B 0,90 € | 0 (A was already the highest) |
| A 1,00 € with "−30 %" promotion, B 1,30 € | 0,60 € (regular price; the 0,60 € promotion counts in promotion savings) |

Quantity 1,5 (loose product), A 2,00 €/kg, B 2,35 €/kg → `round(1,5 × 35)` = 0,53 €.

## 4. Data access (`src/server/repositories/statistics.ts`)

Read-only, three functions:

- `listPurchasesForStats(start, end)`: purchases with `purchasedAt` in `[start, end)`, with
  store name and lines (product name, quantity as a number, unit price, promotion terms
  mapped to `Promo` with the existing mapping used by the purchases repository).
- `monthlyTotals(start, end)`: `{ month, totalCents }` grouped by calendar month over
  `[start, end)` (one raw query with `to_char(purchased_at, 'YYYY-MM')`; summing a column is
  not business logic).
- `listObservationsForProducts(productIds, until)`: price observations of those products
  with `observedAt < until`, with `productId`, `storeId`, `priceCents`, `observedAt`,
  `createdAt`.

The page loads the selected month and the previous month with one
`listPurchasesForStats(start of previous month, end of selected month)` call and splits them
by `monthKey`.

## 5. Screen (`/`)

`src/app/(app)/page.tsx` stays thin: parse the month, load data in parallel
(`Promise.all`), call the domain, render. Its metadata title is "Accueil".

### 5.1 Components (`src/components/dashboard/`)

| Component | Kind | Content |
|-----------|------|---------|
| `month-selector` | Server | "‹" link to the previous month, the month label (`formatMonthLabel`), "›" link to the next month. On the current month the next control is rendered disabled (`aria-disabled`, not a link). 44 px touch targets, `aria-label`s "Mois précédent" / "Mois suivant". |
| `indicator-tiles` | Server | Three tiles: **Dépensé** (total, plus "+12 % vs septembre" when the change is not `null`); **Courses** (count, plus "Panier moyen 48,20 €"); **Économisé** (total in green, with "Promotions" and "Prix le plus haut" sub-lines). Amounts in JetBrains Mono, tabular figures. |
| `monthly-chart` | Client | Recharts `BarChart` of the 12 months. Selected month in terracotta (`--primary`), others muted. Axis labels are short month names ("oct."). Clicking a bar navigates to `?month=`. A visually hidden table lists the 12 values for screen readers; the chart itself is `aria-hidden`. |
| `top-products` | Client | Heading "Produits les plus achetés", a two-option toggle "Dépense" / "Quantité" (`aria-pressed`), then up to 5 rows linking to `/products/[id]` with the amount or quantity (`formatQuantity`). |
| `store-spend` | Server | Heading "Dépenses par magasin", one row per store: name, amount, and a bar whose width is the store's share of the largest store's total. |

### 5.2 Layout

- **Mobile:** stacked: selector, tiles, chart, top products, stores.
- **Desktop (`lg:`):** selector; three tiles in a row; then a two-column grid, chart on the
  left, top products and stores stacked on the right.
- The mobile logout button stays at the bottom of the page (spec §2.1).

### 5.3 Empty state

When the selected month has no purchases, the selector stays and the rest is replaced by
`EmptyState`: title "Aucune course ce mois-ci", description "Enregistre une course pour
voir tes dépenses.", button "Enregistrer une course" → `/purchases/new`.

## 6. PWA manifest

- `src/app/manifest.ts` (Next.js metadata route, served at `/manifest.webmanifest`):
  `name` and `short_name` "cabas", `description`, `lang: "fr-FR"`, `start_url: "/"`,
  `display: "standalone"`, `background_color: "#fbf7f0"`, `theme_color: "#fbf7f0"` (matches the page's `viewport.themeColor`, so the installed status bar blends with the page), icons
  192 px and 512 px (PNG, also `purpose: "maskable"` for the 512 px one) plus the SVG.
- The 192 px and 512 px PNGs are generated once from `src/app/icon.svg` with sharp and
  committed under `public/icons/`.
- Browsers fetch the manifest without the session cookie, so `/manifest.webmanifest` and
  `/icons/*` are added to the public paths in `src/lib/auth/access.ts`. They reveal only the
  app name and its logo.

## 7. Backup

`scripts/backup.sh [output-dir]` (default `./backups`), run from the directory holding the
Compose project:

- `docker compose exec -T db pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"` →
  `cabas-db-YYYYMMDD-HHMM.dump`;
- `docker compose exec -T app tar czf - -C /data uploads` (busybox `tar` of the running
  `node:24-alpine` container, streamed to the host) → `cabas-uploads-YYYYMMDD-HHMM.tar.gz`.
  `compose run` is not used: the image's entrypoint ignores arguments and starts the server;
- `set -euo pipefail`; a partial file is deleted on failure; secrets are never printed.

The Compose project name and service names are those of `docker-compose.yml`; on Coolify the
README explains how to find the project directory or pass `-p`.

### README additions

- **Backup and restore:** the command, a cron example (daily at 03:00, keep 14 days with
  `find -mtime +14 -delete`), and restore steps (`pg_restore --clean --if-exists` into the
  `db` service, `tar xzf` into the `uploads` volume, restart `app`).
- **Install on a phone:** Safari › Partager › Sur l'écran d'accueil; Chrome › Installer
  l'application.

## 8. Testing

- **Unit:** `src/lib/months.test.ts` (parsing, fallbacks, year boundaries, 12-month window);
  `src/domain/statistics.test.ts` (each function, every row of the §3.4 examples, ties,
  empty inputs).
- **Integration (Testcontainers):** `src/server/repositories/statistics.test.ts`: month
  bounds (last day included, first day of next month excluded), monthly totals grouped
  correctly, observations filtered by product and date, promotion terms mapped.
- **Components:** month selector (next disabled on the current month, links), indicator
  tiles (change hidden when `null`), top products toggle, store bars, empty state.
- **Auth:** `access.test.ts` covers the new public paths.
- **End-to-end (Playwright):** record a purchase with a promotion, open `/`, check total
  spent, purchase count and promotion savings; navigate to the previous month and see the
  empty state.
- **Backup:** `shellcheck` on the script and one manual run against the local stack,
  restored into a fresh database.

## 9. Order of work

1. Month helpers.
2. Domain statistics, one function at a time.
3. Repository queries.
4. Recharts dependency, then the dashboard components.
5. `/` page, empty state, Playwright flow.
6. Manifest, install icons, public paths.
7. Backup script, README, roadmap marked done.
