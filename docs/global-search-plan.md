# Global search

One search dropdown, under the Navbar's own search field, finds documents, partners, items, pages and settings, and opens the result. Creating lives on the Navbar's + button.

## Opening it

- **Focusing the Navbar search field** opens the results dropdown right under the field. The panel is always light (`data-theme="light"`).
- **⌘K / Ctrl+K** focuses the field from anywhere; pressed again while in the field, it closes the dropdown.
- **`/`** focuses it unless focus is already in a field.
- **Wiring is app-side for now:** the app finds the field with `.sikat-navbar__search input`, binds its keydown and ARIA, and clears it by setting the value and dispatching an `input` event. A later design-system change would remove the DOM querying: a controlled `searchValue`, an `onSearchKeyDown`, and an input ref or a results slot on `Navbar`.

## Create menu (+ button)

The Navbar's + button (`onCreateClick`) toggles `CreateMenu`, a dropdown under the button, always light like the search results.

- **Commands:** one "New …" command per document, plus customer, vendor, lead and item. Each opens `{list path}/new`.
- **Grouping:** commands are grouped by app (Sales, Purchasing, Inventory, Accounting, CRM), with the current app's group first.
- **Keys and mouse:** typing in the filter narrows the list. ↑↓ moves, Enter opens, ⌘/Ctrl+Enter opens in a new tab. Esc closes and returns focus to +, and so does clicking outside.
- **Source:** `src/components/search/docTypes.ts` builds the commands from each area's `paths.ts`. It is the same document-type table the search index uses, and it imports nothing that loads records.

## Files

| File | What it does |
|---|---|
| `src/services/globalSearch.ts` | Pure ranking: `normalize`, `numberTerms`, `termsOf`, `search(entries, query, { perGroup, expanded })` |
| `src/components/search/docTypes.ts` | Document types (noun, list path, glyph, app) and `createGroups()` for the + menu |
| `src/components/search/CreateMenu.tsx` | The + menu dropdown |
| `src/components/search/searchSources.ts` | The index. `staticEntries()` holds pages and settings and is built synchronously. `recordEntries()` holds documents, partners and items and is cached with `cachedUntilChange` until the next store write |
| `src/components/search/GlobalSearch.tsx` | The dropdown: a fixed panel under the Navbar field, a listbox and keyboard navigation |
| `src/app/AppShell.tsx` | Shortcuts and Navbar field wiring; loads the dropdown lazily on first open (its own chunk) |
| `src/app/nav.tsx` | `navPages()` and `glyphOf()` for the Pages group |

## Ranking

The query and every term are normalized: case, spaces and separators are ignored. Scores, best first:

1. Exact term match.
2. Prefix match.
3. Substring match.
4. Every word of the query found somewhere in the entry.

Ties go to the newer document, then alphabetical order. Document numbers also index a short form, so `PO-2026-0042` is found by `po42`.

Groups appear in this order: Documents, Partners, Items, Pages, Settings. Each shows up to 5 hits, and "Show all N" expands a group in place.

## What is indexed

- **Documents**:
  - every purchasing and sales node from `purchaseDocNodes()` / `salesDocNodes()`;
  - journal entries, journal vouchers, inventory transfers, transfer requests, stock counts and inventory postings.

  Search terms: number, type, partner name and code.

  Unnumbered drafts show their type, never their id.
- **Partners**: name, code, foreign name and TIN. A partner opens under its customer, vendor or lead list.
- **Items**: item no., name, description, foreign name, selling item no., GTIN and barcodes. A variant shows its parent.
- **Pages / Settings**: every sidebar and settings leaf.

About 5,000 entries in the seeded year. They load in one `Promise.all` on first open, and a linear scan per keystroke is fast enough (the result list renders through `useDeferredValue`).

## Empty query

With nothing typed, the dropdown shows recently opened entries, kept per viewer in `localStorage` under `sikat-erp:search-recent` with every access wrapped in try/catch, or a hint to type.

## Tests

- `src/services/__tests__/globalSearch.test.ts`: normalization, short numbers, ranking, groups and caps.
- `e2e/search.spec.ts` checks that:
  - shortcuts open and close the dropdown;
  - `po1` opens PO-2026-0001;
  - partners, items and settings are found;
  - the + menu lists the current app first, filters, opens a blank form and closes on Esc;
  - no raw ids appear.

## Later

- Design system: controlled `searchValue`, `onSearchKeyDown`, and an input ref or results slot on `Navbar`, so the app stops querying the DOM.
- Search line content (item on a document), if needed. `DocNode.items` already carries the lines.
