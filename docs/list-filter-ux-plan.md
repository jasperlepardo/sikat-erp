# List-page Filter UX — chips, field picker & column manager

## Context

Every list (index) page today runs two parallel mechanisms. Free-text **search** lives in
`PageHeader` (`showSearch` / `onSearchChange`) and is applied client-side *after* the structured
filter (e.g. `SalesOrderList.tsx:57-72`). **Structured filters** are driven by `useListPresets()`
(`src/components/filter/useListPresets.tsx`): a `ViewMenu` dropdown used as the page-header title
(the "All ▾" preset picker, `useListPresets.tsx:67-74`), a `FilterBar` that shows the active rules
as **read-only** dismissible chips (`FilterBar.tsx:59-88`), and a side **`PresetPanel`** where rules
are actually built as `field · operator · value` rows (`FilterBar.tsx:92-140`). Adding a filter
means opening the side panel and editing rows — the chips can only *remove*, never *edit*.

The new Figma design (`lFuOcYXanzzbYTJmsEEWR5`, node `21399:199235` "Filter interaction",
mockup subject: the **Sales Order** list) replaces that panel-driven flow with an **inline,
chip-first** interaction, and adds a **column manager**:

- A **toolbar row** under the search box: `[All ▾]  [⊕ Add Filter]  <chips…>  [↺ reset]  [⤓ save view]`.
- **⊕ Add Filter** opens a **field picker** dropdown (Status, Customer, Sales Representative,
  Document Date, Posted Date, Item, Amount).
- Picking a field drops a **chip** (`▼ Status is ✕`) and opens an **inline popover editor**; the
  chip label updates live as values are chosen (`Status is Open Draft`).
- **↺ reset** (discard unsaved changes) and **⤓ save** (save current filter as a view) appear once
  the filter differs from the picked view.
- The **view selector** moves out of the page-header title into this toolbar.
- A **column manager** (▦ icon, top-right): a two-pane **Active Columns / All Columns** popover with
  **drag-to-reorder** and add/remove; the table columns update live.

Per-type editors seen in the mockup:

| Field type | Editor | Figma frame |
|---|---|---|
| choice / status | Is / Is not toggle + checkbox value list; chip reads `Status is Open Draft` | `21520:239785`, `21520:241720` |
| date | quick ranges (Today · This Week · This Month · This Quarter · This Year) + **Custom Date** → calendar with Discard / Save | `21563:46790`, `21563:48654`, `21563:50645` |
| text / number | operator + input (number `between` = two inputs) | — |
| master | searchable value list | — |

### Decisions (confirmed)

| Decision | Choice | Why |
|---|---|---|
| **Goal** | A new filter *interaction*, not a restyle | Users add/edit/remove filters inline via chips + a field picker, instead of a side panel |
| **Rollout** | **Pilot on one page first** — Sales Order (the mockup's screen) | De-risk the interaction before touching the ~30 other list pages |
| **Column manager** | **In scope** — two-pane Active/All with drag-reorder | The Figma board bundles it with the filter flow |
| **Date quick-ranges** | **Relative operators** (not pre-computed dates) | Chip reads "Posted Date is this month" and re-evaluates each day; "today" rolls over |
| **Data/logic layer** | **Reuse `engine.ts` + `useListViews.ts` unchanged** | The filter model, matching, URL sync and saved-preset persistence already exist; only the UI is new |
| **Other list pages** | **Untouched** — keep `menu` / `bar` / `panel` | The pilot opts into an *additive* `toolbar()` output; nothing existing is removed |

**Intended outcome.** On the Sales Order list, the Figma flow works end-to-end — add filters via
chips + field picker, pick relative date ranges, reorder/show-hide columns, and save the result as a
view — while every other list page behaves exactly as before, pending a later rollout.

---

## Architecture — reuse the model, replace only the interaction

The structured-filter stack is already cleanly layered; the plan keeps the bottom two layers intact.

- **Pure logic — `src/components/filter/engine.ts`** — `FilterGroup` / `Rule` (`engine.ts:46-59`),
  operators per type (`OPERATORS_BY_TYPE`, `engine.ts:92-99`), `matches` / `applyFilter`
  (`:237-250`), `describeRule` (`:264-276`), `changeField` / `changeOp` / `newRule` (`:116-130`),
  `isComplete` / `activeRules` (`:137-147`). **One additive change** — the relative-date operator
  (Step 1).
- **State & persistence — `src/components/filter/useListViews.ts`** — filter/sort/view state, URL
  sync (`?view=` / `?filter=`), and saved-preset load/save (`select`, `setFilter`, `edited`,
  `saveNew`, `saveChanges`, `reset`, `views`, `current`). **No change** — the new toolbar is a
  different renderer over the same hook.
- **Field builders — `src/components/filter/fieldKit.ts`** and **saved views —
  `src/services/filterPresets.ts`**. **No change.**

**Keep `FilterBar`, `PresetPanel`, `ViewMenu`** so the other list pages are untouched.
`useListPresets()` gains one **additive** output, `toolbar(search)`, that renders the new UI over its
existing internal `views` state (`useListPresets.tsx:52-65`); `menu` / `bar` / `panel` / `apply` /
`sort` / `setSort` / `query` stay exactly as they are. The pilot page swaps
`title={presets.menu}` + `presets.bar(null)` + `presets.panel` for `presets.toolbar(search)`.

The choice/status editor maps multi-select to the existing `in` / `notIn` operators and single
selection to `is` / `isNot` — **no new choice operators needed**.

---

## Step 1 — Relative-date operator (engine)

Add **one** operator, `inPeriod`, whose `value` is a period key:
`'today' | 'week' | 'month' | 'quarter' | 'year'`. (One op, not five — mirrors how `inLastDays`
already carries its own value, `engine.ts:194-197`, `:272-274`.)

**`src/components/filter/engine.ts`**
- Add `'inPeriod'` to `Op` (`:12-31`); add it to `OPERATORS_BY_TYPE.date` (`:95`), near the front.
- `OP_LABEL.inPeriod = 'is'` (`:69-89`) — the period word is rendered by `describeRule`, not the op label.
- `valueArity('inPeriod') === 1` (falls out of the default, `:104-107`); `isComplete` already
  requires the value (`:137-142`).
- In `test()` date branch (`:181-200`), add `case 'inPeriod'`: compute `[start, end]` for the period
  relative to `today` and return `x >= start && x <= end`. Add a `periodRange(period, today)` helper
  (reuse `addDays` from `services/dates.ts`, `:3`; add local `startOfWeek/Month/Quarter/Year`).
- `describeRule` (`:264-276`): special-case `inPeriod` like `inLastDays` →
  `` `${field.label} is ${PERIOD_LABEL[value]}` `` (e.g. "Posted Date is this month").

**`src/components/filter/aip160.ts`** — teach `formatFilter` / `parseFilter` to round-trip
`inPeriod`. The primary `apply()` path runs through AIP-160 text (`useListPresets.tsx:123-132`), so
the op must serialize there. `encodeFilter` / `decodeFilter` already store op strings generically
(`engine.ts:281-303`), so the URL path needs no change.

**Tests** — add engine cases: each period's range against a fixed `today`, and an aip160 round-trip.

---

## Step 2 — Filter interaction components (`src/components/filter/`)

New files, all built on `engine.ts` helpers, in house style (design-system `Dropdown`, `Badge`,
`Checkbox`, `DatePicker`, `Button`, `IconButton`, `Icon`; straight double quotes in JSX):

- **`AddFilterMenu.tsx`** — the `⊕ Add Filter` button + a `Dropdown` of `fields.map(f => f.label)`.
  On select: `onChange({ ...value, rules: [...value.rules, newRule(field)] })` (`engine.ts:116`) and
  signal the new rule's id so its chip popover auto-opens.
- **`FilterChip.tsx`** — one rule as a pill: filter icon + `describeRule(rule, fields)` (or
  "`Field …`" while incomplete) + caret + dismiss `✕`. Click opens a `Dropdown` popover anchored to
  the chip; `✕` removes the rule (`onChange` dropping it by id, as `FilterBar.tsx:55` does). Reuse
  `Badge` (primary / outline) for styling, matching `FilterBar.tsx:64-74`.
- **`FilterValueEditor.tsx`** — the popover body, switching on `field.type`. **Lift and reshape**
  `FilterBar`'s existing `RuleValue` / `Choice` / `MasterChoice` / `NumberInput`
  (`FilterBar.tsx:211-325`) — they already cover every field type; don't rewrite the matching logic:
  - **choice / master** — Is / Is not toggle + checkbox value list (multi → `in` / `notIn` via
    `changeOp`, `engine.ts:127`); master values via the existing `MasterChoice` loader
    (`FilterBar.tsx:289-299`), which includes inactive rows so old records stay selectable.
  - **date** — quick-range list (Today / This Week / This Month / This Quarter / This Year → write
    `op: 'inPeriod', value: <period>`) + **Custom Date** → `DatePicker` with **Discard / Save**
    (Save commits, Discard reverts to the pre-open value).
  - **text** — operator `Select` + `TextField`.
  - **number** — operator + `NumberInput`; `between` → two inputs with "and" (`FilterBar.tsx:242-250`).

- **`FilterToolbar.tsx`** — assembles the row: view selector (Step 3) + `AddFilterMenu` + active
  chips (`activeRules`, `engine.ts:145`, plus any in-progress rule) + `↺` reset (`views.reset`, shown
  when `edited`) + `⤓` save (save-as-view, shown when `edited`). Same `fields` / `value` / `onChange`
  contract as `FilterBar`, plus the `views` bits it needs.

---

## Step 3 — View selector in the toolbar

The Figma moves "All ▾" out of the page-header title into the toolbar. Reuse `ViewMenu`
(`src/components/filter/ViewMenu.tsx`) — it already renders built-ins, saved presets, and the
save / discard / new / edit actions — as a compact trigger inside `FilterToolbar` (a slim wrapper if
the header-title styling doesn't fit). The `⤓` save-as-view reuses `views.saveNew`
(`useListViews.ts:112-118`); keep the existing `PresetPanel` for the naming step to avoid new form
plumbing.

---

## Step 4 — `useListPresets` additive output

In `src/components/filter/useListPresets.tsx`, add a `toolbar(search: ReactNode)` return that
renders `<FilterToolbar>` wired to the existing internal `views` — reusing the `setFilter` wrapper
that already calls `onChange` (`:55-58`), plus `edited`, `reset`, `saveNew`, `views`, `current`.
Leave `menu`, `bar`, `panel`, `apply`, `sort`, `setSort`, `query` unchanged so no other page is
affected.

---

## Step 5 — Column manager (list pages)

`useColumnPrefs` (`src/components/form/columnPrefs.tsx`) already does show / hide + localStorage
persistence under the `sikat-ui:cols:` prefix (which survives `SEED_VERSION` bumps, `:16-39`) — but
for **document line tables**, and it has **no reorder** and **no two-pane drag UI**. Build a
list-page variant:

- **`useListColumns(listKey, allColumns)`** — owns the visible set **and order**; persists
  `{ order: string[], hidden: string[] }` under the existing `sikat-ui:cols:` prefix. Returns
  ordered + visible `columns` for `Table` and a `manager` node. Model the persistence helpers on
  `loadHidden` / `saveHidden` (`columnPrefs.tsx:23-39`).
- **`ColumnManager.tsx`** — the ▦ `Dropdown`: two panes, **Active Columns** (ordered, drag to
  reorder, `−` to remove) and **All Columns** (`+` to add). Use **native HTML5 drag-and-drop** —
  **no dnd library is installed** (confirmed in `package.json`), so keep it dependency-free with a
  drag handle per row.
- **Pilot columns.** `SalesOrderList` declares its columns inline (`SalesOrderList.tsx:76-119`).
  Declare a **superset** including the columns the Figma "All Columns" pane shows (Posted / Created
  Date, Currency, Valid Until, Remarks, Payment Status), mapped to fields that exist on
  `SalesOrder`; mark the non-default ones hidden initially (via a `PrefColumn`-style `optional` /
  `defaultHidden` tag, `columnPrefs.tsx:10-13`). Render the manager at the search row's right, or via
  `Table`'s `columnMenu` slot that `DataTable` already supports.

---

## Step 6 — Wire the pilot (`src/pages/sales/sales-orders/SalesOrderList.tsx`)

- Drop `title={presets.menu}` from `PageHeader` (`:133`) — the view selector now lives in the
  toolbar — and give the header its plain title.
- Replace `{presets.bar(null)}` (`:142`) with `{presets.toolbar(<search field>)}`. Match the Figma: a
  dedicated search input above the toolbar row (keep the existing free-text search wiring,
  `:30`, `:57-72`, `:124-131`).
- Feed `Table` the ordered / visible columns from `useListColumns` instead of the inline array
  (`:144-153`); render `ColumnManager` at top-right.
- Leave the `presets.apply(...)` + free-text + sort pipeline (`:57-72`) exactly as-is.

---

## Critical files

| File | Change |
|---|---|
| `src/components/filter/engine.ts` | Add `inPeriod` op + `periodRange` helper + `describeRule` case |
| `src/components/filter/aip160.ts` | Round-trip `inPeriod` in `formatFilter` / `parseFilter` |
| `src/components/filter/AddFilterMenu.tsx` | **new** — field picker dropdown |
| `src/components/filter/FilterChip.tsx` | **new** — chip + popover trigger |
| `src/components/filter/FilterValueEditor.tsx` | **new** — per-type value/operator editor (lifted from `FilterBar`) |
| `src/components/filter/FilterToolbar.tsx` | **new** — the toolbar row |
| `src/components/filter/useListPresets.tsx` | Additive `toolbar(search)` output |
| `src/components/form/useListColumns.tsx` + `ColumnManager.tsx` | **new** — ordered columns + two-pane drag manager |
| `src/pages/sales/sales-orders/SalesOrderList.tsx` | Pilot wiring |
| engine unit test | Relative-date range + aip160 round-trip cases |

**Reuse, never redefine:** `useListViews` (all filter/view state), `fieldKit` field builders,
`filterPresets` collection, `describeRule` / `activeRules` / `newRule` / `changeField` / `changeOp`,
`MasterChoice` value loading, `addDays` (`services/dates.ts`), and the `sikat-ui:cols:` persistence
convention. **Left in place for the other ~30 list pages:** `FilterBar`, `PresetPanel`, `ViewMenu`,
and the existing `useListPresets` outputs.

---

## Verification

1. `npm run typecheck` and `npm run lint` — 0 errors.
2. `npm test` — engine tests pass, including new relative-date and aip160 round-trip cases.
3. `npm run dev`, open `/#/sales/sales-orders`, walk the Figma flow:
   - ⊕ Add Filter → field menu → **Status** → chip + popover (Is / Is not + Draft/Open/Close) → tick
     Open + Draft → chip reads `Status is Open Draft`, table filters.
   - Add **Posted Date** → quick ranges → **This Month** → chip reads `Posted Date is this month`,
     table filters; **Custom Date** → calendar → Save.
   - Add **Amount** (number `between`) and **Customer** (text `contains`) → table filters.
   - `↺` reset clears unsaved changes; `⤓` save stores a view that appears in the toolbar's view
     selector and survives reload (localStorage) and a URL copy (`?view=` / `?filter=`).
   - ▦ column manager → drag to reorder, add / remove a column → table updates, layout persists across reload.
4. Confirm other list pages (`/#/sales/invoices`, `/#/inventory/items`) are visually and
   behaviourally **unchanged** (still `menu` / `bar` / `panel`).
5. `npm run knip` — zero (tag any not-yet-wired export `@public`).
6. `npm run test:e2e` — the screen sweep still loads Sales Order with no errors or raw ids.

---

## Requirements for the implementer (handoff)

This section is the shared contract for the session building the filter. The hard requirements are
numbered; open questions are flagged **[DECIDE]**.

### R1 — Reuse, don't re-model
- **Do not touch** `engine.ts` matching logic, `useListViews.ts`, `fieldKit.ts`, or `filterPresets.ts`
  beyond the single `inPeriod` addition (Step 1). All filter state, URL sync (`?view=`/`?filter=`),
  and saved-preset persistence already exist — the new UI is a *renderer* over `useListViews`.
- **Do not remove or edit** `FilterBar.tsx`, `PresetPanel.tsx`, `ViewMenu.tsx`. They stay for the
  ~30 non-pilot pages. The pilot opts into a **new additive** `useListPresets().toolbar(search)`.

### R2 — Use the design system `Chip`; the only app code is a popover wrapper
- **Update (DS 0.45, commit `47dce1d`):** the design system now ships a **`Chip`** component
  (`ChipProps`: `intent` `default|primary|success|danger`, `size` `small|medium`, style `soft`-only,
  `selected`, `onSelect`, `onRemove`, `removeLabel`, `leadingIcon`). `FilterBar` is already migrated
  to it (`FilterBar.tsx:65-74`). **Use `Chip` — do not compose `Badge` and do not build a new pill.**
- The chip VISUAL + the `×` remove + the pressed state are 100% the DS `Chip`. The **only** new
  behavior is the click-to-edit popover, which `Chip` doesn't carry. So the app code is a thin
  wrapper:
  - **`FilterChip.tsx`** (built) — `Chip` (`selected={open}`, `onSelect={toggle}`,
    `onRemove`, `leadingIcon=filter_list`) inside a `useDropdown` root, anchoring a `Dropdown`
    popover that renders the editor. Label is `describeRule(rule, [field])`.
  - **`FilterValueEditor.tsx`** (built) — operator `Select` + per-type value input, lifted from
    `FilterBar`'s `RuleValue`/`Choice`/`MasterChoice`/`NumberInput`.
- Both files type-check and lint clean, are tagged `@public` (not yet wired), and touch no existing
  file. Home: **app-local** in `src/components/filter/` (the DS already owns the reusable `Chip`, so
  no DS publish is needed for the pilot).

### R3 — Value editors are lifted, not rewritten
- `FilterValueEditor` reshapes `FilterBar`'s existing `RuleValue` / `Choice` / `MasterChoice` /
  `NumberInput` (`FilterBar.tsx:211-325`) into a popover body. Keep their matching semantics:
  multi-select → `in`/`notIn`, single → `is`/`isNot` (`engine.ts` `changeOp`). Master values must
  include inactive rows (old records), as `MasterChoice` already does.

### R4 — Date quick-ranges = the `inPeriod` operator (Step 1)
- Quick ranges write `{ op: 'inPeriod', value: 'today'|'week'|'month'|'quarter'|'year' }`.
  "Custom Date" falls back to the existing `is`/`before`/`after`/`between` + `DatePicker` with
  Discard/Save. Chip reads "Posted Date is this month" via `describeRule`. `aip160.ts` must
  round-trip `inPeriod` (the `apply()` path is AIP-160 text).

### R5 — Column manager
- New `useListColumns(listKey, allColumns)` (order + hidden) persisted under the existing
  `sikat-ui:cols:` prefix (survives `SEED_VERSION` bumps). `ColumnManager` = two-pane Active/All
  `Dropdown` with **native HTML5 drag** (no dnd library is installed). Pilot declares a **superset**
  of `SalesOrder` columns; non-defaults start hidden.

### R6 — Scope & conventions
- Pilot **only** `src/pages/sales/sales-orders/SalesOrderList.tsx`. No other list page changes.
- Straight double quotes in JSX; ids-not-names (e.g. status/master values stored as ids/codes, shown
  via `describeRule`); `''` for no-selection; `bind()`/`activeOptions` where applicable.
- Bump `SEED_VERSION` only if a `src/mocks/` file changes (this plan shouldn't need it).

### Open questions to resolve with the building session
1. ~~R2 chip home~~ — **resolved:** DS 0.45 ships `Chip`; chips use it, wrapper stays app-local.
2. Does the toolbar keep free-text search in `PageHeader`, or move it inline above the toolbar row to
   match the Figma search input? (Plan assumes a dedicated search input above the toolbar.)
3. Save-as-view (`⤓`): inline name popover vs reuse the existing `PresetPanel` for naming?
   (Plan assumes reuse `PresetPanel` to avoid new form plumbing.)
