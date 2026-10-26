# Sikat ERP — Claude Guide

## What this is

**Sikat ERP** is a frontend-only UI prototype of an ERP system for Philippine businesses. No backend — screens read/write mock data via service functions backed by `localStorage`. Designed so real `fetch` calls can replace the mock services later.

Demo scenario: an Apple Premium Reseller in the Philippines, with seed data covering every BIR VAT and withholding tax combination. **Purpose:** Proof-of-concept / design prototype for the `@jasperlepardo/sikat-design-system` package.

---

## Stack

- **Vite + React 19 + TypeScript** — standard Vite SPA
- **React Router 7** — hash routing (`/#/inventory/items`); intentional for static hosting
- **Tailwind CSS v4** — tokens come from the design system
- **`@jasperlepardo/sikat-design-system`** — published to GitHub Packages; current version ~0.39.x
- **Playwright** smoke tests in `e2e/` — every screen loads with no errors or raw ids

## Commands

```sh
npm run dev        # Start dev server
npm run typecheck  # TypeScript check only
npm run lint       # ESLint (0 errors expected; exhaustive-deps warnings are known)
npm run knip       # Unused files, exports and dependencies — keep it at zero
npm run build      # tsc -b && vite build
npm run test:e2e   # Playwright smoke tests (starts its own dev server on :5199)
npx tsx scripts/check-seeds.ts  # Seed tie-out check (stock, ledger) — run after any mock change
```

Before/after checks for performance work and refactors. The `tsx` scripts take an optional path to another checkout, so the same check runs on old and new code: `git worktree add ../before HEAD`, then diff the two outputs.

```sh
npx tsx scripts/seed-fingerprint.ts [checkout]   # Hashes of the seeded year: a refactor of mocks or the history must not move them
npx tsx scripts/posting-check.ts [checkout]      # Post a receipt + delivery; prints stock, costs, FIFO layers and store waits
npx tsx scripts/fifo-check.ts [checkout]         # FIFO layers: sequential and concurrent takes, transfer, cost refresh
npx tsx scripts/bench-data-layer.ts [checkout]   # CPU time and store round trips (250 ms each in the app)
node scripts/bundle-sizes.mjs                    # After npm run build: what a cold load of each route downloads
node scripts/cold-load.mjs [url]                 # Against npx vite preview --port 4173: time to first table row per route
node scripts/interaction-latency.mjs [url]       # Against the same preview: input-to-paint latency, 4× CPU throttle
```

---

## Directory layout

```
src/
  app/          AppShell, router, sidebar nav
  components/   Shared UI — filter/, form/, activity/
  data/psgc/    Philippine Standard Geographic Code
  mocks/        Seed data (one file per entity); masters.ts — typed ID helpers
  pages/        Feature pages — accounting/, approvals/, banking/, crm/, inventory/, partners/, people/, purchasing/, sales/, settings/
  services/     Fake async API + domain logic
e2e/            Playwright specs — screens.spec.ts sweeps every route
scripts/        check-seeds.ts (tie-out check), build-psgc.mjs
```

Routes are defined in `src/app/router.tsx`. All use hash routing (`/#/…`). Detail pages use `:tab?` for top-level page switching. Declare a new page with `page(() => import(…), 'Name')`, never a bare `React.lazy`. `withPreload` has the router load the chunk before rendering, which avoids React's ~300 ms Suspense-fallback throttle on every cold load.

---

## Core data layer

`src/services/store.ts` — `createCollection<T>(storageKey, seed, idPrefix, { audit? })`

localStorage holds only the changes since the seed (`{ saved, removed }`), not the whole list. Every write bumps a global store version; `cachedUntilChange(build)` caches values derived from several collections (e.g. the document link graph) until the next write. Pass `{ audit: 'PO' }` to log saves to the audit log the Activity tab reads.

Key rules:
- **Bump `SEED_VERSION`** in `store.ts` whenever any file in `src/mocks/` changes. A browser on an older version drops all saved data and reloads the seed.
- Never mutate rows from `useCollection()` or `snapshot()` — they are shared references. Copy before editing.
- Write several records with `collection.saveMany(rows)` (or `saveItems` for items), never `for … await save()`. Each save is a 250 ms round trip and an audit write, so posting a 20-line document went from 10 s to one wait. Read with `snapshot()` when you only need to check the current state before a write; `list()` adds another round trip and deep-copies the whole collection.
- Seeds that depend on other seeds must be lazy functions `() => seed` to avoid circular module init.
- After changing any seed: `npx tsx scripts/check-seeds.ts` — exits non-zero on stock/ledger tie-out failures.

Hooks: `useCollection(collection)` → live `readonly T[]`; `useAsync<T>(load, deps)` → undefined while loading; `useCollectionRows(collection)` → `{ rows, save, setActive }`.

---

## The seeded year

Books from 1 Jan 2026 to **9 Oct 2026** (`SEED_AS_OF`). Store POS sales, supply plan POs, corporate sales chains, purchasing history, stock/FIFO layers, and ledger all tie out. Document numbers are computed positionally (`seedPoNo`, `seedSoNo`, `seedDnNo`, `seedArNo`) — text naming a number must use these helpers.

**`mergedItems(items)`** — variants inherit parent's item group, G/L accounts, valuation method, UoMs, and tax setup. Use `mergedItems()` whenever logic depends on those fields (tax, costing, posting). Use raw item data only for variant-specific fields (price, SKU, barcodes, stock).

---

## Data conventions

- **Foreign keys are ids, never names.** Field named `…Id` (`paymentTermId`) or `…Code` (`countryCode`). Look up display names at render time: `nameIn()`, `paymentTermName()`, `binCodeOf()`, etc. A raw id visible on screen is a bug — the e2e sweep catches it.
- **Generated ids** (`pt-004`) for anything renameable. `id === code` only where the code is locked on save: countries, UoMs, UoM groups, manufacturers, warehouses, tax codes, tax groups, withholding groups, excise categories, G/L accounts.
- **`''` for "no selection"** — never a placeholder string like `'— None —'` or a fake record.
- **Child rows, not maps.** Nested lists are `{ itemGroupId, discountPct }[]`, never objects keyed by a name.
- **Snapshots on posted documents.** Posting stamps bin codes (`withBinCodes()`), item numbers, descriptions, addresses. Drafts show live values; posted lines show the snapshot.
- **Seed id lists** in `src/mocks/masters.ts` are `as const` and positional — append only, never reorder.
- **Dates are ISO 8601, never formatted in storage.** Calendar dates (posting, due…) are `YYYY-MM-DD` with no zone; timestamps are UTC ending in `Z`; time zones are IANA names. Show them only through `formatDate` / `formatDateTime` (user's format and zone, Settings › Preferences). "Today" is `todayISO()` — the company's time zone — never `new Date().toISOString().slice(0, 10)`.

---

## Master-data pattern — `MasterDef<T>`

One `MasterDef<T>` drives both the settings list page (`MasterList`) and the inline `MasterLookup` picker in any form. All defs live in `src/pages/settings/masterDefs.tsx`.

```ts
interface MasterDef<T> {
  collection: Collection<T>;
  icon: string; title: string; noun: string; home: string;
  blank: (name: string) => T;
  value: (row: T) => string;   // what to store — the id
  label: (row: T) => string;   // what to display
  columns: TableColumn<T>[];
  searchText: (row: T) => string;
  editor: (row, update, errors, isNew) => ReactNode;
  validate: (row, all) => Errors;
  normalize?: (row: T) => T;
}
```

```tsx
<MasterLookup def={uomDef} value={draft.uomId} onChange={(id) => update({ uomId: id })}
  where={(row) => row.active} clearable disabled={saving} />
```

Always use `activeOptions(rows, keyFn, labelFn, currentValue)` when building picker options — pass `currentValue` so a stale saved value stays selectable.

---

## `bind()` field builder

`src/components/form/fields.tsx` re-exports `bind()` from the design system and adds `f.master()`.

```ts
const f = bind(draft, update);
f.text('name', 'Item Name', { required: true })
f.pick('type', 'Type', typeOptions)
f.choose('vatType', 'VAT Type', vatOptions)
f.check('active', 'Active')
f.master('uomId', 'Unit', uomDef, { required: true })
```

Layout helpers: `<Fields cols={2}>`, `<FieldStack>`, `<Flags>`, `<ReadOnly label value />`.

Use the **local `Section`** from `fields.tsx` (Card + Card.Header + Card.Content) — not the one exported by the design system.

---

## Detail page structure

### Form state and validation

```ts
const [draft, setDraft] = useState<Draft>(initial);
const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
const [errors, setErrors] = useState<Errors>({});
```

- Remount when record id changes: `<MyForm key={id === 'new' ? location.key : id} />`.
- Validation: `problemCollector<Tab>()` → `need(ok, tab, key, message)` → show `ProblemsAlert` + jump to first failing tab.
- Editing state for nested SidePanel editors: discriminated union `| { kind: 'contact'; value: …; isNew: boolean } | null`.

### Layout

**Master records (Items, Partners):** `lg:col-span-3` aside (identity + subsidiary cards) + `lg:col-span-9` main (tabs).

**Quotation / invoice:** `lg:col-span-8` (CustomerCard + ContentsTable) + `lg:col-span-4` (DetailsCard + AttachmentsCard).

**Sales order:** `lg:col-span-3` aside (DatesCard, SettingsCard, etc.) + `lg:col-span-9` (CustomerCard + tabbed contents).

### Document pages — `TabProps` / `DocContext`

All tab components receive the same spread:

```ts
interface TabProps { draft: Draft; update: (patch: Partial<Draft>) => void; errors: Errors; m: Masters; ctx: DocContext; }
interface DocContext {
  customer?: Partner; fx: number; rateOf: (code: string) => number;
  vatRegistered: boolean; readOnly: boolean; added: boolean;
}
const tabProps = { draft, update, errors, m, ctx };
```

### File structure

Every detail page lives in a `detail/` folder.

**Flat layout** (purchasing docs — PO, GR, AP invoice, etc.): all card files at `detail/` level, no subfolders. Card file prefix matches doc abbreviation (`Po`, `Gr`, `Ap`, `Dpr`, `Rfq`, `Pr`, `Pay`, `Cm`, `Gret`).

**Tab subfolder layout** (docs with real UI tabs): one subfolder per tab. `index.tsx` is a one-line re-export or multi-card orchestrator.

```
detail/
  MyDocDetail.tsx     ← orchestrator: state, data loading, layout, PanelHeader
  types.ts            ← Draft, Masters, SectionProps, DocContext types
  PfxNounCard.tsx     ← cards always visible above tabs
  tab-name/
    index.tsx          ← export { XCard as TabNameTab } from './XCard'
    XCard.tsx
```

**Rule:** only create a tab subfolder when there is a real `<Tabs>` switching view. Sequential cards that all render at once stay flat at `detail/` level.

| File | Convention | What it is |
|---|---|---|
| `detail/PfxNounCard.tsx` | `[Prefix][Noun]Card` | Card in the layout |
| `detail/NounPanel.tsx` | `[Noun]Panel` | SidePanel editor launched from this page |
| `tab/index.tsx` | re-export or orchestrator | Entry point for a real UI tab |
| `tab/NounCard.tsx` | `[Noun]Card` | Card inside a real UI tab |

Shared purchasing components used across multiple document types live in `purchasing/shared/` (`ReferencesTable`, `PurchTotalsFooter`, `CopyPanel`, `DocumentFlow`, and `ReturnDocumentsList`, which is the goods returns and A/P credit memos list behind both tabs).

An export kept only for tests or docs, with no caller yet, carries a `@public` JSDoc tag so `npm run knip` keeps it.

---

## Document status pattern

Five statuses: `Draft` (default) → `Not Confirmed` (warning) → `Open` (primary) → `Closed` (success) or `Cancelled` (danger). Closed and Cancelled have no outgoing transitions.

```tsx
const moves: Partial<Record<MyStatus, () => void>> =
  draft.status === 'Draft'  ? { Open: () => submit() }           // or 'Not Confirmed' with approvals
  : draft.status === 'Open' ? { Closed: closeIt, Cancelled: cancelIt }
  : {};

<StatusField statuses={MY_STATUSES} intents={STATUS_INTENT}
  value={draft.status} moves={moves} hint={STATUS_HINT[draft.status]} error={errors.status} />
```

---

## Filter system

List pages use `useListPresets()` from `src/components/filter/useListPresets.tsx`. Add filtering to a new list page:

```tsx
const fields = [
  textField<D>('no', 'No.', (d) => d.no),
  dateField<D>('postingDate', 'Date', (d) => d.postingDate),
  statusField<D>(MY_STATUSES),
  masterField<D>('currency', 'Currency', currencyDef, (d) => d.currency),
];
const presets = useListPresets({
  list: 'my-docs',
  fields,
  builtIns: statusViews('My docs', MY_STATUSES),
  defaultSort: { key: 'postingDate', direction: 'desc' },
  rows: allRows,
  onChange: resetPage,
});

// In JSX:
<PanelHeader title={presets.menu} … />
{presets.bar(null)}
<Table rows={presets.apply(allRows)} sort={presets.sort} onSortChange={presets.setSort} … />
{presets.panel}
```

List pages use `useListPage()` from `DataTable.tsx` — never declare `page`/`pageSize` state manually.

---

## Activity tab

Every document and master record has an Activity tab. Timeline shows the document chain, audit log changes, and logged CRM activities.

```tsx
<ActivityTab target={{ kind: 'PO', id }} partnerId={doc.vendorId} />
```

---

## Philippines-specific

- **BIR taxes:** VAT (12%/0%), EWT, FWT, Excise — `taxDetermination.ts`
- **PSGC:** cascading province → city → barangay via `PhLocationFields`
- **Currency:** PHP; `formatAmount()` uses `en-PH` locale; `parseBspBulletin()` parses BSP forex bulletins

---

## Coding standards

### Naming
- Foreign-key fields: `…Id` or `…Code`. Never store a name; look it up at render time.
- `''` for "no selection" — never a placeholder string or fake record.
- Generated id for anything renameable; `id === code` only for code-locked records.

### Data
- Never mutate `useCollection()` / `snapshot()` rows — copy before editing.
- `activeOptions(rows, keyFn, labelFn, currentValue)` for all picker options; always pass `currentValue`. Tax-code pickers use `taxCodeOptions(codes, direction, current)` (`services/taxCodeOptions.ts`), with the row's own code as `current`.
- Shared helpers, never redefined in a file:
  - `round2` / `round4` (`services/num.ts`);
  - `addDays` (`services/dates.ts`);
  - `lineNet` / `priceAfterDiscount` / `inventoryQty` (`services/lineMath.ts`, used by PO, PR and SO);
  - `revenueAccountFor` / `cogsAccountFor` (`services/itemAccounts.ts`);
  - `rateFrom` (`mocks/taxes.ts`);
  - `rowDiscount` / `rowSettled` / `meansTotal` / `weightedDueDate` (`services/paymentMath.ts`).
- Nested lists are row arrays, never objects keyed by a name.
- Bump `SEED_VERSION` whenever any `src/mocks/` file changes.
- Seed id lists in `masters.ts` are append-only (positional — never reorder).

### Forms and UI
- An optional picker clears with `clearable` (bind: `{ clearable: true }`) and shows `placeholder="None"`: never a `{ value: '', label: '— None —' }` option.
- Document detail pages:
  - `useDocTab(path, tabParam)` for the tab in the URL;
  - `siblingKeys(all, numberOf)` for Previous/Next;
  - `useReject()` for the Reject reason box (all in `components/form/DetailNav.tsx`).
- `bind()` + layout helpers — never raw input elements in a form.
- Discriminated union for SidePanel editing state.
- `problemCollector` → `ProblemsAlert` + tab jump for validation.
- Use straight double quotes (`"it's"`) in JSX string props — smart/curly quotes break the TS/Babel parser.

### Architecture
- `MasterDef` + `MasterLookup` + `activeOptions` for all master-data pickers — no one-off hand-rolled `<Select>`.
- List paths and status intents (`PO_LIST_PATH`, `AP_STATUS_INTENT`…) live in `src/pages/<area>/paths.ts`, which has type-only imports. Never import anything from a routed page module (a `*Detail`/`*List` in `router.tsx`): that pulls the whole page into every chunk that links to it.
- Use the local `Section` from `fields.tsx`, not the one exported by the design system.
- Use `mergedItems()` whenever logic depends on item group, G/L accounts, valuation method, UoMs, or tax setup.
