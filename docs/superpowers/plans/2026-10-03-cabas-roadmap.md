# cabas — Implementation roadmap

The spec ([`2026-10-03-cabas-design.md`](../specs/2026-10-03-cabas-design.md)) is delivered
in four plans. Each plan ends with working, tested, deployable software, and each later plan
is written once the previous one is merged, so it builds on the real code rather than on
assumptions.

| # | Plan | Delivers | Spec sections |
|---|------|----------|---------------|
| 1 | [Foundation & catalog](2026-10-03-cabas-plan-1-foundation-catalog.md) | Project setup, Docker stack, database, image storage, app shell and theme, stores, products, manual prices, price comparison, alternatives | §2, §3, §4 (Store, Product, PriceObservation, ProductAlternative), §5.1–5.3, §6.1, §6.2, §6.6–6.8, §7, §8, §9 |
| 2 | [Purchases](2026-10-04-cabas-plan-2-purchases.md) | New purchase form with draft, purchase history, detail, edit and delete, purchase-driven price observations | §4 (Purchase, PurchaseItem), §5.4, §6.4, §6.5 |
| 3 | Shopping lists | Lists, per-store estimate, check-off, conversion into a purchase | §4 (ShoppingList, ShoppingListItem), §5.5, §6.9 |
| 4 | Dashboard & release | Monthly statistics, savings, charts, PWA manifest, README and backup | §5.6, §6.3, §3 (backup) |
