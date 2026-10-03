# cabas — Design spec

- **Date:** 2026-10-03
- **Status:** Draft, awaiting review
- **Related:** [`CLAUDE.md`](../../../CLAUDE.md), [`docs/best-practices.md`](../../best-practices.md),
  mockups in [`docs/mockups/`](../../mockups/)

## 1. Purpose

cabas is a self-hosted, mobile-first web app that lets a single user:

1. **Record grocery purchases** right after shopping: store, items with quantities and
   prices, total paid, and a photo of the receipt.
2. **Track spending**: monthly totals, trends, most purchased products, spending per store,
   and money saved by buying at the cheapest store.
3. **Find cheaper options**: compare a product's latest price across stores (also per kilo,
   per litre or per piece) and browse cheaper alternative products.
4. **Plan future shopping**: build shopping lists from the catalog, see an estimated cost
   per store, check items off in the store, and turn the list into a recorded purchase.

### Success criteria

- Recording a typical 10-item purchase on a phone takes under 3 minutes, and existing
  products are prefilled with their latest price in that store.
- For any product, the cheapest known store and the price per unit of measure are visible
  at a glance.
- The same data is available from the phone and the PC, with no manual sync.

## 2. Users, access and constraints

- **Single user**, no accounts and no authentication. The app is reachable only through the
  user's **NetBird** network; the network is the security boundary.
- **Self-hosted** on the user's homelab with `docker compose`.
- **UI language:** French (`fr-FR`), currency **EUR**, timezone **Europe/Paris** for all
  date grouping. **Code and documentation:** English.
- **Mobile first**, fully usable on desktop. Installable to the home screen (PWA manifest),
  **no offline mode**.

## 3. Stack and deployment

See `CLAUDE.md` and `docs/best-practices.md` for versions and conventions.

| Concern | Choice |
|---------|--------|
| App | Next.js 16 (App Router, Server Components, Server Actions), React 19.2, TypeScript strict |
| Package manager | pnpm 10 |
| Database | PostgreSQL 18 via Prisma 7 (`@prisma/adapter-pg`) |
| UI | Tailwind CSS 4, shadcn/ui, Recharts 3, Lucide icons |
| Validation | Zod 4 |
| Images | sharp, files stored on a Docker volume |
| Tests | Vitest (unit, integration with Testcontainers, components), Playwright (E2E) |

### Deployment

- `docker-compose.yml` with two services:
  - `app`: multi-stage image built from the Next.js `standalone` output on `node:24-alpine`,
    running as the non-root `node` user. The entrypoint runs `prisma migrate deploy`, then
    `node server.js`. It publishes one port (configurable, default `3000`).
  - `db`: `postgres:18-alpine`, not published on the host, with a `pg_isready` healthcheck.
    `app` waits for `db` to be healthy.
- Named volumes: `pgdata` (mounted at `/var/lib/postgresql`) and `uploads` (mounted at
  `/data/uploads` in `app`).
- Configuration through `.env` (an `.env.example` is committed): `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `UPLOADS_DIR`, `APP_PORT`,
  `TZ=Europe/Paris`. Environment variables are validated at startup with Zod.
- **Backup:** the README documents one command that runs `pg_dump -Fc` and archives the
  `uploads` volume, so the user can schedule it with cron.

## 4. Data model

All money is stored in **integer cents**. Product sizes are stored in a **base unit**
(`G`, `ML`, `PIECE`). Every table has `id` (UUIDv7), `createdAt` and `updatedAt`.

### Store

| Field | Type | Notes |
|-------|------|-------|
| `name` | string, required, unique (case-insensitive) | e.g. "Lidl Lomme" |
| `address` | string, optional | |
| `logoPath` | string, optional | relative path in `uploads/` |

### Product

| Field | Type | Notes |
|-------|------|-------|
| `name` | string, required | |
| `brand` | string, optional | |
| `photoPath` | string, optional | |
| `sizeValue` | integer > 0, required | in base unit: 500 (g), 1000 (ml), 12 (pieces) |
| `sizeUnit` | enum `G` \| `ML` \| `PIECE` | |

The product has **no price field**: prices live in `PriceObservation`. A product sold
loose by weight is modeled with a reference size (e.g. `1000 G`) and fractional
purchase quantities (e.g. 1.2).

### PriceObservation

| Field | Type | Notes |
|-------|------|-------|
| `productId` | FK → Product | |
| `storeId` | FK → Store | |
| `priceCents` | integer > 0 | price for one unit of the product (one pack, or the reference size) |
| `observedAt` | date | |
| `source` | enum `PURCHASE` \| `MANUAL` | |
| `purchaseItemId` | FK → PurchaseItem, optional, unique | set when `source = PURCHASE` |

Index on `(productId, storeId, observedAt)`.

### Purchase

| Field | Type | Notes |
|-------|------|-------|
| `storeId` | FK → Store | |
| `purchasedAt` | date | defaults to today |
| `totalCents` | integer ≥ 0 | amount actually paid; may differ from the sum of lines |
| `receiptPath` | string, optional | |

### PurchaseItem

| Field | Type | Notes |
|-------|------|-------|
| `purchaseId` | FK → Purchase, cascade delete | |
| `productId` | FK → Product | |
| `quantity` | decimal(10,3) > 0 | 2, or 1.2 for loose products |
| `unitPriceCents` | integer > 0 | |

Each `PurchaseItem` owns exactly one `PriceObservation` (`source = PURCHASE`) with the same
product, the purchase's store and date, and its `unitPriceCents`. Creating, editing or
deleting the item (or its purchase) creates, updates or deletes that observation in the
same transaction.

### ProductAlternative

| Field | Type | Notes |
|-------|------|-------|
| `productAId` | FK → Product, cascade delete | always the smaller of the two IDs |
| `productBId` | FK → Product, cascade delete | |

Unique on `(productAId, productBId)`; a product cannot be its own alternative. The link is
**symmetric**: storing the pair once makes each product an alternative of the other.

### ShoppingList and ShoppingListItem

| ShoppingList field | Type | Notes |
|-------|------|-------|
| `name` | string, required | |
| `status` | enum `OPEN` \| `DONE` | |
| `purchaseId` | FK → Purchase, optional | set when the list is turned into a purchase |

| ShoppingListItem field | Type | Notes |
|-------|------|-------|
| `listId` | FK → ShoppingList, cascade delete | |
| `productId` | FK → Product | unique per list |
| `quantity` | decimal(10,3) > 0 | |
| `checked` | boolean, default `false` | |

### Deletion rules

- **Store**: deletion is blocked while it is referenced by a purchase or a price
  observation.
- **Product**: deletion is blocked while it appears in a purchase. Otherwise its manual
  observations, alternative links and shopping list items are deleted with it.
- **Purchase**: deletes its items, their price observations and the receipt file. A shopping
  list linked to it goes back to `OPEN`, with `purchaseId` cleared.
- Deleting a record deletes its image files (original and thumbnail).

## 5. Domain rules

All rules below live in `src/domain/` as pure functions with 100% unit test coverage.
Functions that depend on "today" take the current date as a parameter.

### 5.1 Price per unit of measure

- `G` → price per kilo = `priceCents × 1000 / sizeValue`
- `ML` → price per litre = `priceCents × 1000 / sizeValue`
- `PIECE` → price per piece = `priceCents / sizeValue`
- Results are rounded to the nearest cent for display only.
- Two products are **comparable** only when they share the same `sizeUnit`.

### 5.2 Latest price per store

For a product, the **current price in a store** is the observation with the latest
`observedAt` (ties broken by latest `createdAt`). The **cheapest store** is the one with the
lowest current price. Each row shows how old the price is ("il y a 3 j").

### 5.3 Alternatives

- The carousel lists the product's alternatives, each with its best current price per unit
  of measure, sorted from cheapest to most expensive per unit.
- When an alternative is comparable and cheaper per unit than the current product, it shows
  a badge with the relative difference, rounded to the nearest percent (e.g. "−20 %").
- Alternatives that are not comparable show their price without a badge.

### 5.4 Purchase totals

- Line subtotal = `round(quantity × unitPriceCents)`.
- Sum of lines = sum of subtotals. The total paid is prefilled with this sum and can be
  edited (discounts, items not recorded).
- When a product is added to a purchase, its unit price is prefilled with its current price
  in the purchase's store, or left empty when none is known.

### 5.5 Shopping list estimate

For each store with at least one known price for a product in the list:

- estimate = sum of `round(quantity × current price in that store)` over the items that have
  a price there;
- `missingCount` = number of items without a known price in that store.

Ordering: stores with `missingCount = 0` first, sorted by estimate ascending, then the
others sorted by `missingCount` ascending, then by estimate. The first complete store gets
the "Moins cher" badge.

### 5.6 Statistics (per calendar month, Europe/Paris)

- **Total spent**: sum of `totalCents` of the month's purchases.
- **Change vs previous month**: `(current − previous) / previous`, rounded to the nearest
  percent. It is hidden when the previous month has no purchases.
- **Purchase count** and **average basket** (`total / count`).
- **12-month chart**: total spent for each of the 12 months ending with the selected month.
- **Top 5 products**: by spend (sum of line subtotals), switchable to by quantity.
- **Spend per store**: sum of `totalCents` per store, sorted descending.
- **Saved vs highest price**: for each purchase item of the month, the reference price is
  the highest *current price as of the purchase date* among all stores (only observations
  with `observedAt ≤ purchasedAt` count, including this purchase's own). The item counts
  only when at least two stores have a price.
  `saved = max(0, reference − unitPriceCents) × quantity`, rounded, summed over the month.

## 6. Screens and flows

Visual direction: **"Ticket de caisse"** (receipt). Cream paper background, ink text,
terracotta primary (`#C2410C`), green for savings and best prices (`#166534`), Fraunces
for headings, Inter for text, JetBrains Mono for all prices and quantities (tabular
figures), small corner radius (6 px), and receipt-style dashed separators and serrated card
edges. Light theme first. Dark theme tokens are defined as CSS variables, but dark mode
polish is not required for v1.

Validated mockups: [`01-visual-direction.html`](../../mockups/01-visual-direction.html)
(direction B), [`02-mobile-screens.html`](../../mockups/02-mobile-screens.html),
[`03-desktop-screens.html`](../../mockups/03-desktop-screens.html). They are fragments
for the brainstorming companion; open them for layout reference.

### 6.1 Navigation

- **Mobile (< 1024 px):** bottom bar with Accueil, Courses, a central **＋** button (new
  purchase), Produits and Listes. Magasins is reached from an icon in the page header. The
  bar is hidden in the new purchase form, which has a fixed save bar instead.
- **Desktop (≥ 1024 px):** left sidebar with the "cabas" wordmark, a **Nouvelle course**
  button, then Accueil, Courses, Produits, Listes and Magasins.
- Popups are bottom sheets (`Drawer`) on mobile and centered dialogs (`Dialog`) on desktop.

### 6.2 Routes

| Route | Screen |
|-------|--------|
| `/` | Dashboard (statistics), `?month=YYYY-MM` |
| `/purchases` | Purchase history |
| `/purchases/new` | New purchase form, optional `?fromList=<id>&store=<id>` |
| `/purchases/[id]` | Purchase detail |
| `/purchases/[id]/edit` | Edit purchase (same form) |
| `/products` | Product grid, `?q=` search |
| `/products/[id]` | Product detail |
| `/stores` | Store list (create, edit, delete) |
| `/lists` | Shopping lists |
| `/lists/[id]` | Shopping list detail |
| `/uploads/[...path]` | Route Handler serving stored images |

### 6.3 Dashboard (`/`)

- A month selector (previous and next; next is disabled for the current month).
- Indicators: total spent with the change vs the previous month, purchase count with the
  average basket, and money saved vs the highest price.
- The 12-month bar chart (selected month highlighted), the top 5 products (spend or
  quantity) and spend per store (horizontal bars).
- Mobile: stacked. Desktop: 3 indicators in a row, then the chart on the left with the top
  products and stores on the right.
- Empty state: "Aucune course ce mois-ci" with a button to record one.

### 6.4 New purchase (`/purchases/new`)

A single page, filled top to bottom:

1. **Store**: a searchable combobox. When there is no match, it offers "Créer « … »", which
   opens the **store sheet** (name, address, logo).
2. **Date**: defaults to today.
3. **Items**: a product search combobox. Selecting a product adds a line with a quantity
   stepper (decimals allowed) and the unit price, prefilled per §5.4. When there is no
   match, "Créer « … »" opens the **product sheet** (photo, name, brand, size value, size
   unit, price in the selected store) with a live price per unit of measure. Lines can be
   removed. The running sum of lines is shown.
4. **Total paid**: prefilled with the sum and editable.
5. **Receipt photo**: camera capture on mobile, drag-and-drop or file picker on desktop.
6. **Save**: creates the purchase, its items and their price observations in one
   transaction, then redirects to the purchase detail with a success toast.

- A draft (store, date, lines, total) is saved to `localStorage` on each change and
  restored when the page is reopened; it is cleared after a successful save. Photos are not
  part of the draft.
- When opened from a shopping list, the form is prefilled with the list's checked items (or
  all items when none is checked) and the chosen store's current prices. Saving marks the
  list `DONE` and links it to the purchase.
- Desktop: an items table (article, quantity, unit price, subtotal) on the left and a fixed
  summary card (sum, total paid, receipt drop zone, save) on the right.
- Validation: a store, at least one item, and quantity and price > 0 on each line.

### 6.5 Purchase history and detail

- History grouped by month (newest first), with each month's total. Mobile: receipt-style
  cards (store logo, store name, date, item count, total). Desktop: one table per month
  (date, store, items, receipt link, total).
- Detail: store, date, the lines with subtotals, the sum of lines vs the total paid, and the
  receipt photo (tap to enlarge). Actions: edit, delete (with confirmation).

### 6.6 Products (`/products`)

- A grid of cards (2 columns on mobile, up to 5 on desktop) with photo, name, brand and size,
  and the best known price ("dès 0,99 €", in green). Name and brand search.
- A "Nouveau produit" button opens the product sheet without a price.
- Empty state with a call to action.

### 6.7 Product detail (`/products/[id]`)

- Photo, name, brand, size. Actions: edit, delete (blocked per §4 with an explanation).
- **Prices by store**: logo, store, age of the price, price, price per unit of measure,
  cheapest highlighted with a "Moins cher" badge (§5.2).
- **"Ajouter un prix"** opens the price sheet or dialog: store (combobox with creation),
  price (with live price per unit), date (defaults to today). It creates a `MANUAL`
  observation.
- **Alternatives** carousel (§5.3), horizontally scrollable with scroll snap. Tapping a card
  opens that product. **"Ajouter une alternative"** opens a product search; removing a link
  is available from a card's menu.
- Desktop: info on the left, prices table on the right, alternatives below.

### 6.8 Stores (`/stores`)

- A list with logo, name and address. Create, edit and delete (blocked per §4).

### 6.9 Shopping lists (`/lists`, `/lists/[id]`)

- Index: open lists first, then done lists. Create a list (name).
- Detail:
  - add products (search) with a quantity, edit the quantity with a stepper, remove;
  - tick items as they go in the cart (saved immediately);
  - **estimate per store** (§5.5): store, estimate, "N produits sans prix", "Moins cher"
    badge on the best complete store;
  - **"Terminer → créer la course"** asks for the store (the cheapest preselected), then
    opens `/purchases/new?fromList=…&store=…`.
- Mobile: estimate above the items, action in a fixed bottom bar. Desktop: items on the
  left, estimate on the right.

## 7. Images

- Accepted: JPEG, PNG or WebP up to 10 MB, confirmed by decoding with sharp. HEIC is not
  supported by sharp's prebuilt binaries; iOS Safari already converts camera photos to JPEG
  when uploading through a file input.
- Processing: apply EXIF orientation, strip metadata, resize (receipts ≤ 1600 px on the
  long edge, products and logos ≤ 800 px), encode as WebP, and generate a 300 px thumbnail.
- Storage: `uploads/{stores|products|receipts}/<uuid>.webp` and `<uuid>-thumb.webp`. Only
  the relative path is stored in the database.
- Served by `/uploads/[...path]`, which rejects path traversal and sends
  `Cache-Control: public, max-age=31536000, immutable`.
- When a write fails after a file was saved, the file is deleted.

## 8. Error handling

- **Validation**: every Server Action parses its input with Zod. Errors show under the
  related field, in French, with how to fix them. Focus moves to the first invalid field,
  and entered values are kept.
- **Expected failures** (not found, duplicate store name, blocked deletion) return
  `{ ok: false, errors }` and are shown inline or as an error toast.
- **Unexpected failures**: an `error.tsx` per section shows a short message and a
  "Réessayer" button. Details are logged on the server only, never rendered.
- **Not found**: `not-found.tsx` with a link back.
- **Image rejected**: an error on the photo field; the rest of the form can still be
  submitted without the photo.
- **Feedback**: submit buttons show a pending state and are disabled while pending;
  successful mutations show a toast ("Course enregistrée"). Destructive actions need
  confirmation.
- **Empty states** on every list, each with a primary action.

## 9. Testing strategy

TDD as defined in `CLAUDE.md`: every behavior starts with a failing test.

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | All of `src/domain/` (§5): price per unit and comparability, latest price and cheapest store, alternatives ordering and badge, line and purchase totals, list estimate and ordering, monthly statistics and savings, cents/euros parsing and formatting. Target: 100% coverage. |
| Integration | Vitest + Testcontainers (PostgreSQL 18) | Repositories and Server Actions: purchase creation writes items and observations atomically and rolls back on failure; editing and deleting items keeps observations in sync; symmetric alternatives; deletion rules (§4); list-to-purchase conversion; statistics queries. |
| Components | Vitest + Testing Library | Quantity stepper, store and product comboboxes with "Créer…", new purchase form (running sum, draft restore), product sheet (live price per unit), price sheet. |
| End-to-end | Playwright (mobile and desktop projects, production build) | 1) record a purchase while creating a store and a product; 2) add a manual price from a product page and see the cheapest store update; 3) build a list, check items, convert it into a purchase. |

`pnpm lint && pnpm typecheck && pnpm test` must pass before every commit.

## 10. Out of scope for v1

- Authentication and multiple users.
- Offline mode and background sync.
- Receipt OCR and barcode scanning.
- Price history charts per product.
- Categories or tags for products.
- Data import or export.
- Dark mode polish (tokens exist, no dedicated design pass).
