# cabas — Promotions on purchase lines

- **Date:** 2026-10-08
- **Status:** Draft, awaiting review
- **Branch:** `feat/promotions`
- **Amends:** [`2026-10-03-cabas-design.md`](2026-10-03-cabas-design.md) §4 (PurchaseItem),
  §5.4, §5.6, §6.3, §6.4, §6.5

## 1. Purpose

Stores run promotions that change what a line actually costs: an instant discount, "le 2e à
−60 %", "2 achetés = 1 offert", "3 pour 2". Today the only way to record them is to lower
the total paid by hand, which loses which product was discounted and by how much.

This change lets the user attach **one promotion to a purchase line**, by picking its type
as printed on the shelf label. The app computes the discount, keeps the promotion's terms so
it can be shown and edited later, and recomputes it when the quantity changes.

### Success criteria

- Entering a promotion on a line takes a few taps and needs no mental arithmetic.
- The sum of lines (and the prefilled total paid) reflects what was paid after promotions.
- The purchase detail shows each line's promotion and the total saved through promotions.
- Price comparisons across stores are not distorted by temporary offers.

### Out of scope

- Loyalty-card credit ("cagnotte", vouchers credited for later): it does not reduce what is
  paid at checkout.
- More than one promotion per line.
- Promotions spanning several products ("2 produits de la gamme achetés = …").
- Promotions on products or stores outside a purchase (standing offers, catalogues).
- Promotions in shopping lists: the estimate keeps using regular prices.

## 2. Decisions

| Topic | Decision |
|-------|----------|
| Price observation | Keeps the **regular** unit price. The promotion only lowers the line amount. |
| Storage | The promotion's **terms** are stored on the line; the discount is always computed by the domain, never stored. |
| Quantity | Counts **every item taken, free ones included**, as on the receipt. |
| Amount off | Applies **per item** (per kilo / litre for loose products), like the unit price. |
| Multi-item promotions | Count **whole items only**: `floor(quantity)`. |
| Promotion not reached | It is kept on the line, gives a discount of 0, and the line explains what is missing. |
| Dashboard savings | Promotion savings are counted, shown separately from savings vs the highest price. |

## 3. Promotion types

| Kind | UI label | Parameters | Label shown on a line |
|------|----------|------------|------------------------|
| `AMOUNT_OFF_PER_UNIT` | − € / article | `amountCents` | −0,50 € par article |
| `PERCENT_OFF` | − % | `percent` | −30 % |
| `NTH_PERCENT_OFF` | Le Ne à −% | `nth`, `percent` | Le 2e à −60 % |
| `BUY_GET_FREE` | Achetés / offerts | `buy`, `free` | 2 achetés = 1 offert |

`NTH_PERCENT_OFF` with `percent = 50` covers "le 2e à moitié prix". `BUY_GET_FREE` with
`buy = 2, free = 1` covers both "2 achetés = 1 offert" and "3 pour 2".

### Parameter ranges (validated with Zod, French messages)

| Parameter | Range | Error message |
|-----------|-------|---------------|
| `amountCents` | integer ≥ 1 | « Indique la remise par article, par exemple 0,50. » |
| `amountCents` | `≤ unitPriceCents` | « La remise dépasse le prix de l’article. » |
| `percent` | integer, 1 to 100 | « Indique un pourcentage entre 1 et 100. » |
| `nth` | integer, 2 to 10 | « Indique un rang entre 2 et 10. » |
| `buy`, `free` | integers, 1 to 20 | « Indique un nombre d’articles entre 1 et 20. » |

## 4. Calculations

All amounts are integer cents, rounded half up. `units = floor(quantity)`, computed from the
quantity in thousandths (like `lineSubtotal`) to avoid floating-point errors.

- **Gross** (unchanged): `gross = lineSubtotal(quantity, unitPriceCents)`.
- **Discount** before capping:
  - `AMOUNT_OFF_PER_UNIT`: `lineSubtotal(quantity, amountCents)`.
  - `PERCENT_OFF`: `round(gross × percent / 100)`.
  - `NTH_PERCENT_OFF`: `round(floor(units / nth) × unitPriceCents × percent / 100)`.
  - `BUY_GET_FREE`: with `group = buy + free`,
    `freeItems = floor(units / group) × free + max(0, units mod group − buy)`,
    discount `= freeItems × unitPriceCents`.
- **Discount** = `min(discount, gross)`; no promotion → 0.
- **Net** = `gross − discount`.
- **Minimum quantity** (for the "not reached" message): `nth` for `NTH_PERCENT_OFF`,
  `buy + 1` for `BUY_GET_FREE`, none for the other kinds. A promotion is "not reached"
  when `units` is below it.

### Examples (unit price 1,20 €)

| Promotion | Quantity | Discount | Net |
|-----------|----------|----------|-----|
| −0,50 € par article | 3 | 1,50 € | 2,10 € |
| −30 % | 3 | 1,08 € | 2,52 € |
| Le 2e à −60 % | 3 | 0,72 € | 2,88 € |
| Le 2e à −60 % | 4 | 1,44 € | 3,36 € |
| 2 achetés = 1 offert | 2 | 0 € (not reached, « il faut 3 articles ») | 2,40 € |
| 2 achetés = 1 offert | 3 | 1,20 € | 2,40 € |
| 2 achetés = 1 offert | 6 | 2,40 € | 4,80 € |
| 2 achetés = 2 offerts | 3 | 1,20 € | 2,40 € |
| Le 2e à −60 % | 1,5 (loose) | 0 € (not reached) | 1,80 € |

## 5. Data model

`PurchaseItem` gains (all optional):

| Field | Type | Notes |
|-------|------|-------|
| `promoKind` | enum `PromoKind` | `AMOUNT_OFF_PER_UNIT` \| `PERCENT_OFF` \| `NTH_PERCENT_OFF` \| `BUY_GET_FREE` |
| `promoAmountCents` | integer | `AMOUNT_OFF_PER_UNIT` only |
| `promoPercent` | integer | `PERCENT_OFF` and `NTH_PERCENT_OFF` only |
| `promoNth` | integer | `NTH_PERCENT_OFF` only |
| `promoBuy` | integer | `BUY_GET_FREE` only |
| `promoFree` | integer | `BUY_GET_FREE` only |

A SQL `CHECK` constraint (added by hand in the migration) enforces that each kind has
exactly its own parameters set and all others null, and that no parameter is set without a
kind. Existing rows need no backfill: they have no promotion.

`PriceObservation` is unchanged: it keeps `unitPriceCents`.

## 6. Architecture

- **`src/domain/promo.ts`** (new, pure): the `Promo` discriminated union, `lineDiscount`,
  `promoMinimumQuantity`.
- **`src/domain/purchase.ts`**: `PurchaseLine` gains an optional `promo`; `lineNet` returns
  the amount after the promotion; `sumOfLines` sums net amounts; `sumOfDiscounts` sums
  discounts. `lineSubtotal` keeps its meaning (gross).
- **`src/lib/format.ts`**: `formatPromo(promo)` returns the French label from §3.
- **`src/server/actions/purchases.schema.ts`**: each line accepts an optional `promo`,
  validated as a discriminated union on `kind` with the ranges of §3.
- **`src/server/repositories/purchases.ts`**: maps `Promo` to and from the columns on
  create, update and read. The price observation logic is unchanged.
- **`src/lib/purchase-draft.ts`**: a draft line gains an optional `promo` (kind plus string
  inputs). The storage key stays `v1`: older drafts without promotions still parse.
- **UI**: a promotion editor on each line of the purchase form, a promotion row on each line
  of the purchase detail, and a "Promos" row in both summaries.

## 7. Screens

Mockups were approved during brainstorming
(`.superpowers/brainstorm/…/promo-ui.html`, not committed).

### Purchase form, line

1. **No promotion**: the line as today, plus a "+ Promo" link (touch target ≥ 44 px).
2. **Editing**: four toggle buttons (one per kind) and the fields for the selected kind:
   - − € / article: `[0,50] € par article`
   - − %: `[30] %`
   - Le Ne à −%: `Le [2]e à −[60] %` (`nth` defaults to 2)
   - Achetés / offerts: `[2] achetés = [1] offert(s)`
   The line amount shows the gross struck through and the net, updated as the user types,
   with the discount in green below. An "OK" button (disabled while a value is invalid)
   folds the editor; a "Retirer la promo" button removes the promotion. (An explicit button
   rather than "fold when focus leaves": Safari does not focus tapped buttons.)
3. **Applied** (after "OK", or when a saved promotion is opened): a green summary
   « 🏷 2 achetés = 1 offert · −1,20 € »; tapping it reopens the editor.
4. **Not reached**: an amber summary « 🏷 2 achetés = 1 offert · il faut 3 articles ».

Invalid parameters mark the field `aria-invalid` and give no discount until fixed; the save
is refused with the §3 message.

### Summaries (form and detail)

- « Avant promos »: sum of gross amounts — shown only when at least one line has a discount.
- « Promos (n articles) »: `−sumOfDiscounts`, in green, where `n` is the number of lines with
  a discount — same condition.
- « Somme des articles »: sum of net amounts. The total paid is prefilled with it.
- « Écart (oublis, arrondis) »: `totalCents − sum of net amounts`, when not zero.
- « Total payé ».

### Purchase detail, line

The quantity × regular unit price line as today, the net amount on the right, and the
promotion label with its discount (green) or « il faut N articles » (amber) below, as in
the form.

## 8. Effects on later plans

- **Shopping lists (plan 3)**: unchanged, estimates use regular current prices.
- **Dashboard (plan 4)**:
  - Top products by spend use **net** line amounts.
  - The "money saved" indicator is the sum of two parts shown separately: promotion
    discounts of the month and savings vs the highest price (§5.6 of the main spec, still
    computed from the regular `unitPriceCents`).

## 9. Testing

- **Unit** (`promo.test.ts`, `purchase.test.ts`): every row of the §4 examples table, the
  cap at the gross amount, 100 %, rounding half up, loose quantities, `sumOfLines` and
  `sumOfDiscounts` with mixed lines.
- **Schema** (`purchases.schema` tests): valid promotion per kind, each out-of-range
  parameter, amount above the unit price, unknown kind, parameters of another kind.
- **Integration** (PostgreSQL via Testcontainers): create, edit (add, change, remove the
  promotion) and read a purchase with promotions; the price observation keeps the regular
  price; the `CHECK` constraint rejects inconsistent columns.
- **Components**: the line promotion editor (pick a kind, live net amount, not-reached
  message, remove), the summary rows, draft round-trip with a promotion.
- **End-to-end**: the "record a purchase" Playwright flow adds a "2 achetés = 1 offert"
  promotion and checks the detail page.
