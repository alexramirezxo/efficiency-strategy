# MUN Puzzle Board — v1.3.1 (GitHub Pages ready)

A responsive Model United Nations delegation planning and efficiency application built with React, TypeScript, Vite and Zustand.

## Saved Setups and single-name delegate workflow

### One delegate name field
Delegates now use a single **Name** field instead of separate first-name and last-name fields. Existing v1.1 browser data is migrated automatically: previous first + last names are merged into the new Name field.

### Two focused views only
The application now has two top-level views:

1. **Puzzle Board** — the live workspace where you drag delegates between committee seats and assign awards.
2. **Saved Setups** — a library of alternative distributions/snapshots.

### Saved distributions
Use **Save Setup** at any time to freeze the complete current arrangement. Each saved setup keeps its own copy of:

- competition information
- committees and formats
- award inventories and hierarchy
- delegate roster
- committee slots
- delegate placements
- awards/results
- points and efficiency calculations

Changing the live board later does not change an older saved setup.

From **Saved Setups** you can:

- see multiple arrangements as overview cards
- compare efficiency, active slots, delegates and points
- click a setup to inspect every committee and slot
- rename a setup
- load a saved setup back onto the Puzzle Board
- replace a saved snapshot with the current live board
- delete a saved setup

Saved setups persist in browser localStorage and are included in JSON exports.

## Run locally in VS Code

Open this folder in VS Code, then open **Terminal → New Terminal** and run:

```bash
npm install
npm run dev
```

Open the local address Vite prints, normally:

```text
http://localhost:5173
```

Keep the terminal running while using the app.

## Updating from the previous version

You can replace the old source folder with this version and run:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

The application intentionally keeps the same localStorage key so existing competition data can migrate into v1.2 when you open the updated app on the same local origin.

## Core calculation rules

- Awards belong to slots, not individual delegates.
- Pair committees require two occupied seats before a slot is active.
- A slot can receive at most one result.
- Possible points are the sum of the highest-ranked available award inventory entries up to the number of active slots.
- Achieved points are the points from awards actually won by active slots.
- Committee efficiency = achieved points / possible points × 100.
- Committees without active slots are excluded from overall efficiency.
- Overall efficiency is the unweighted arithmetic mean of participating committee efficiencies.
- Pair awards count once per slot, never once per delegate.

## Commands

```bash
npm run dev
npm run build
npm test
npm run preview
```

## Data persistence

The app stores live competition data and saved setups in browser localStorage under the key:

```text
mun-efficiency-system-v1
```

The key name remains unchanged for migration compatibility; the internal persisted-data version is now v2.


## v1.3 — Committee Chairs & Topics

Each committee now supports a topic and up to 6 chairs. Every chair has a name and home delegation. The Puzzle Board stays compact and shows only chair names; use **More details** on a committee to view/edit the topic and chair delegations. These fields are also preserved in saved setups and JSON exports, and included in CSV exports.


## GitHub Pages deployment

This package is configured to deploy as a static GitHub Pages site with GitHub Actions. See [`GITHUB_PAGES.md`](./GITHUB_PAGES.md) for the exact publication steps.

The app functionality is unchanged. The GitHub Pages adaptation only changes build/deployment configuration.
