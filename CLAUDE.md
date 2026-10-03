# CLAUDE.md — cabas

Application web auto-hébergée (mobile first) pour enregistrer ses courses, suivre ses
dépenses, comparer les prix des produits entre magasins et préparer des listes de courses
avec estimation du coût par magasin.

- Utilisateur unique, pas d'authentification : l'accès est restreint au réseau NetBird.
- Hébergement : homelab, via `docker compose` (services `app` + `db`).
- Langue de l'interface : français. Langue du code (identifiants, noms de fichiers) : anglais.
- Les specs et plans vivent dans `docs/superpowers/specs/` et `docs/superpowers/plans/`.

## Stack

| Rôle | Choix |
|------|-------|
| Framework | Next.js 15 (App Router), TypeScript strict |
| Base de données | PostgreSQL 17 |
| ORM / migrations | Prisma |
| UI | Tailwind CSS + shadcn/ui |
| Graphiques | Recharts |
| Images | sharp (redimensionnement + miniatures à l'upload) |
| Validation | Zod (entrées de formulaires et Server Actions) |
| Tests unitaires / intégration | Vitest (+ Testing Library pour les composants) |
| Tests end-to-end | Playwright (parcours critiques uniquement) |
| Déploiement | Docker (image Next.js `standalone`, build multi-étapes) |

Ne pas ajouter de dépendance sans raison claire ; préférer ce que la stack fournit déjà.

## Principes obligatoires

Ces trois principes s'appliquent à **chaque** changement, sans exception.

### TDD — Test Driven Development

1. **Red** : écrire d'abord un test qui échoue et qui décrit le comportement attendu.
2. **Green** : écrire le minimum de code pour le faire passer.
3. **Refactor** : nettoyer en gardant les tests verts.

- Aucun code de production sans test qui l'exige au préalable.
- Pour un bug : écrire d'abord le test qui reproduit le bug, puis corriger.
- Logique métier (`src/domain/`) : tests unitaires purs, sans base ni réseau.
- Accès aux données et Server Actions : tests d'intégration contre une vraie base
  PostgreSQL de test (pas de mock de Prisma).
- Composants : tester le comportement visible par l'utilisateur (Testing Library),
  pas les détails d'implémentation.
- Playwright uniquement pour les parcours clés (enregistrer une course, ajouter un prix,
  convertir une liste en course).
- Un test = un comportement, nommé en phrase : `it("calcule le prix au kilo d'un produit de 500 g")`.

### KISS — Keep It Simple, Stupid

- La solution la plus simple qui satisfait le besoin actuel. Pas d'abstraction « au cas où » (YAGNI).
- Server Components par défaut ; `"use client"` seulement quand l'interactivité l'exige.
- Server Actions pour les mutations ; pas de couche API REST tant qu'aucun besoin réel n'existe.
- Pas de state manager global : état serveur via le rendu serveur, état local via `useState`.
- Fichiers courts et focalisés ; un fichier qui grossit est le signe qu'il fait trop de choses.
- Pas de code mort, pas de code commenté, pas de TODO laissé sans ticket.

### SOLID

- **S** — Responsabilité unique : un module = une raison de changer. La logique métier
  ne connaît ni React, ni Prisma, ni Next.js.
- **O** — Ouvert/fermé : étendre par composition (nouveaux composants, nouvelles fonctions)
  plutôt que modifier du code stable avec des `if` en cascade.
- **L** — Substitution de Liskov : une implémentation doit respecter le contrat de son
  interface (types et comportement).
- **I** — Ségrégation des interfaces : des types et props petits et ciblés plutôt qu'un
  gros objet fourre-tout.
- **D** — Inversion des dépendances : le domaine définit les interfaces dont il a besoin
  (ex. dépôt de prix) ; l'infrastructure (Prisma, système de fichiers) les implémente.

Appliquer SOLID avec pragmatisme : il sert KISS, il ne justifie pas de sur-ingénierie.

## Architecture du code

```
src/
  app/            # Routes Next.js (pages, layouts, route handlers) — fines, sans logique métier
  components/     # Composants UI réutilisables (ui/ = shadcn)
  domain/         # Logique métier pure : prix unitaire, estimations, statistiques (100 % testée)
  server/
    actions/      # Server Actions : validation Zod → appel domaine/dépôt → revalidation
    repositories/ # Accès aux données via Prisma
    storage/      # Stockage et traitement des photos (sharp, volume uploads)
  lib/            # Utilitaires transverses (formatage monétaire, dates…)
prisma/
  schema.prisma
  migrations/
tests/
  e2e/            # Playwright
```

Règles de dépendance : `app` → `server` → `domain`. Le domaine ne dépend de rien d'autre
que de lui-même. Les tests unitaires et d'intégration sont placés à côté du fichier testé
(`foo.ts` + `foo.test.ts`).

## Conventions de code

- TypeScript `strict`, aucun `any` ; préférer `unknown` + validation Zod aux frontières.
- Toute donnée entrante (formulaire, paramètre d'URL, fichier) est validée par Zod
  avant d'atteindre le domaine.
- Montants stockés en **centimes entiers** (`Int`), jamais en flottant. Formatage en
  euros uniquement à l'affichage.
- Contenance stockée en unité de base (`g`, `ml`, `piece`) pour permettre la comparaison
  au kilo / au litre / à la pièce.
- Nommage : `camelCase` (variables, fonctions), `PascalCase` (composants, types),
  `kebab-case` (fichiers hors composants).
- Mobile first : styles de base pour mobile, puis `md:` / `lg:` pour le PC. Cibles
  tactiles d'au moins 44 px.
- Accessibilité : labels sur tous les champs, contrastes suffisants, navigation clavier sur PC.
- Messages d'erreur utilisateur en français, clairs et actionnables.
- Migrations Prisma versionnées ; ne jamais modifier une migration déjà commitée.

## Commandes

À maintenir à jour au fil de la mise en place du projet.

```bash
npm run dev          # serveur de développement
npm test             # Vitest (unitaires + intégration)
npm run test:e2e     # Playwright
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npx prisma migrate dev   # créer/appliquer une migration en local
docker compose up -d --build   # lancer la stack complète
```

Avant chaque commit : `npm run lint && npm run typecheck && npm test` doivent passer.

## Git et commits

- **Conventional Commits** obligatoires : `<type>(<scope>): <description>`
  - Types : `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `build`, `ci`, `perf`.
  - Scope facultatif, en minuscules : `feat(products): add price per unit comparison`.
  - Description à l'impératif, en anglais, sans majuscule initiale ni point final.
  - `BREAKING CHANGE:` en pied de message si nécessaire.
- Commits petits et atomiques : un changement logique par commit, tests inclus.
- **Aucune mention de Claude ou d'une IA** dans les commits ou les PR : pas de
  `Co-Authored-By`, pas de « Generated with Claude Code », pas d'emoji robot.
- Branche principale : `main`. Travail sur des branches `feat/…`, `fix/…`.
