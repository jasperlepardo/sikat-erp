# Sikat ERP — Codebase Audit & Optimization Plan

_Audited 2026-10-26 on branch `settings-tax-cleanup`._

| Phase | Status |
|---|---|
| 1 — Bundle | Done 2026-10-26, not yet committed |
| 2 — Data layer | Done 2026-10-26, not yet committed |
| 3 — Seed/history build → page start-up | Done 2026-10-26, not yet committed |
| 4 — Render cost | Done 2026-10-26: measured, one cleanup; not yet committed |
| 5 — De-duplication | Done 2026-10-26, not yet committed |
| 6 — Dead code & tooling | Done 2026-10-26, not yet committed |

## Progress log

**2026-10-26: Phase 1, bundle**
- About 60 path and status-intent constants moved into `src/pages/<area>/paths.ts`.
- `Home` is lazy-loaded.
- `companies.ts` imports the warehouses collection on first use.
- `voucherState` moved to `services/journalVouchers.ts`.
- Result: the entry chunk went from 915 to 481 KB, and a document page's cold load dropped by 25–30%.
- About 110 files touched, mostly import lines.

**2026-10-26: Phase 2, data layer**
- `saveMany` in the store, `saveItems` for items, batched audit writes, and batched FIFO layer writes.
- The audit log no longer invalidates caches.
- Result: posting 20 lines' item updates went from about 10 s of fake latency to about 0.25 s.
- Fixed a race where concurrent FIFO consumption lost stock.
- 15 files touched under `src/services/`.

**2026-10-26: Phase 6, dead code and tooling**
- Added ESLint (`npm run lint`) and knip (`npm run knip`).
- Deleted 4 unused files and about 50 dead declarations, and made about 100 exports file-local.
- Merged the goods returns and A/P credit memos list pages into one component.
- Vitest is left to `docs/test-plan.md`.

**2026-10-26: Phase 3, start-up**
- Measured in the browser: building the history isn't the bottleneck. The whole cold load scripts for about 170 ms.
- The real cost was React holding the loading fallback for about 270 ms after each page's code had already arrived.
- The router now loads page code before rendering. Each page's first table row appears about 150 ms (about 20%) sooner on a cold load.
- `stockHistory` also got cheaper (about 95 → 70 ms in Node), with byte-identical output.

**2026-10-26: Phase 4, render cost**
- Measured interaction latency (input to next paint) under 4× CPU throttling. The worst case was 80 ms, well inside the 200 ms "good" threshold, so the planned render optimisations are skipped.
- One cleanup: AppShell now passes the current company to `DateSettings`, so the company and its warehouse list load once instead of twice.

**2026-10-26: Phase 5, de-duplication** (the other sessions were paused, so their files were in scope)
- Fixed the picker bug that dropped deactivated tax codes and other stale values, in 30+ pickers.
- 54 `round2` copies, 10 date helpers and other duplicates moved into shared modules.
- `useDocTab`, `siblingKeys` and `useReject` now serve about 20 document pages.
- Merged the A/R and reserve invoice contents cards and customer panels, the blanket-agreement lines and summary cards, the business-partner channel cards, and the document-flow table.
- Removed every `'— None —'` option and the 3 raw inputs.
- Found and fixed a bug: list pages dropped the "saved" or "rejected" notice a detail page sent back to them.
- Result: 508 → 505 files and about 900 fewer lines. Lint warnings went from 35 to 12.

**Not committed yet.** All six phases sit in the working tree on `settings-tax-cleanup`, mixed with other sessions' uncommitted tax-settings work. Commit each phase on its own and stage shared files by hunk. The **Notes for the commit** under each phase list those shared files.

**How to resume:**
1. Check `git status` and the running Claude sessions for concurrent work.
2. All six phases are done. What's left is follow-ups each phase lists as not done (e.g. passing an item `Map` into `arJournal`/`apJournal` once the tax work is committed), plus dropping the tax-settings entries from `knip.json` `ignoreIssues`.
3. Follow **Verification (each phase)** at the end of this doc.

The measuring scripts are in `scripts/` (listed in `CLAUDE.md` § Commands):
- `seed-fingerprint.ts`, `posting-check.ts`, `fifo-check.ts` and `bench-data-layer.ts` run the services under `tsx`, and take another checkout's path for old-versus-new diffs.
- `bundle-sizes.mjs`, `cold-load.mjs` and `interaction-latency.mjs` measure the production build.

Re-run on the final tree, `bundle-sizes` gives cold totals about 20–30 KB above the Phase 1 table (for example, PO list 986 → 1,011 KB). That is likely Phase 5's new shared modules regrouping chunks; the cause hasn't been checked. `cold-load` and `interaction-latency` give the same figures as Phases 3 and 4.

## Context
A whole-codebase audit (~590 files, ~82k lines) and how to optimize it. Three read-only audits ran (data layer, React/bundle, conventions/duplication); key claims were spot-checked against the code. Findings are grouped into phases by payoff ÷ risk. Each phase is independently shippable; nothing below changes behavior or seed data (no SEED_VERSION bump needed unless a phase touches `src/mocks/` output).

Before each phase, check `git status` for concurrent uncommitted work, and never `git stash`.

---

## Phase 1 — Bundle: stop lazy pages dragging in each other (biggest win)

> **Done 2026-10-26.** These numbers are minified JS from `vite build`. A cold load is the entry chunk plus every chunk the route statically imports.
>
> | | Before | After |
> |---|---|---|
> | Entry chunk | 915 KB | 481 KB |
> | Purchase order list (cold) | 1,581 KB | 986 KB |
> | Item detail (cold) | 1,692 KB | 1,211 KB |
> | Partner detail (cold) | 1,634 KB | 1,200 KB |
> | Goods receipt / PO / AP / AR / SO detail (cold) | ~1,577 KB (one shared 420 KB chunk) | 1,180–1,224 KB (own chunks) |
>
> What changed:
> - About 60 path and status-intent constants moved into `pages/{purchasing,sales,accounting,inventory,people}/paths.ts`.
> - `voucherState` moved to `services/journalVouchers.ts`.
> - `Home` is lazy-loaded.
> - `companies.ts` imports the warehouses collection on first use.
> - Two unused duplicates were deleted: `BA_LIST_PATH` in `sales/agreements/detail/types.ts`, and `PBA_LIST_PATH` in `purchasing/purchase-agreements/detail/types.ts` (which held the wrong path).
>
> No routed page module is imported by another module any more. The weight that remains is seed data the pages really use; Phase 3 can reduce it.
>
> Skipped: splitting `masterDefs.tsx` (≈46 KB source; not worth rewriting 102 importers) and `manualChunks` (it would make every page download every seed).
>
> Trade-offs:
> - The cold load for the home page and item list is about the same as before. The seed data moved out of the entry chunk into chunks the page loads.
> - The journal entry page now loads 616 KB on top of the entry chunk, up from 174 KB, because that seed data used to be in the entry. Its cold total is unchanged (1,090 → 1,097 KB).
>
> Verification:
> - `npm run typecheck` and `npm run build` pass, and all 143 tests in `npm run test:e2e` pass.
> - Measured by building the pre-change source and the current source, then adding up each route's static import closure in `dist/assets`. The measuring script isn't committed.
>
> Notes for the commit:
> - About 110 files changed, mostly import lines. The edits were made with a codemod; renames covered the bare `STATUS_INTENT` exports, which became `PO_`, `PR_` and `RFQ_STATUS_INTENT`.
> - Four of those files also had other sessions' uncommitted tax work: `sales/invoices/detail/ArContentsCard.tsx`, `sales/reserve-invoices/detail/RiContentsCard.tsx`, `sales/sales-orders/detail/types.ts` (`SO_LIST_PATH` moved out) and `people/detail/EmployeeDetail.tsx`. Phase 1's changes there are import lines only. Stage those files by hunk, so Phase 1 goes in its own commit, separate from the tax work.
> - `CLAUDE.md` § Architecture has a new rule: shared constants go in `paths.ts`, and nothing is ever imported from a routed page module.

**Original findings:**

Routes are already lazy (`src/app/router.tsx:12`), but splitting is defeated:
- **Cross-page constant imports.** `src/pages/purchasing/shared/documentLinks.ts:7-27` and `src/pages/sales/shared/salesDocumentLinks.ts:15-25` import `*_LIST_PATH` / `*_STATUS_INTENT` from page modules (`PurchaseOrderDetail`, `ApInvoiceDetail`, `GoodsReceiptDetail`, `DprDetail`, `JournalEntryDetail`…). Result: each detail page statically pulls ~16–18 other pages (~1.4–1.6 MB source).
  → Move these constants into dependency-free `pages/purchasing/paths.ts`, `pages/sales/paths.ts` (and accounting) and re-export from the old locations; update `documentLinks.ts`, `salesDocumentLinks.ts`, `PurchaseOrderDetail.tsx:82-83`, `SalesOrderDetail.tsx:29`, `JournalVoucherDetail.tsx:27`, `VoucherEntryDetail.tsx:24`.
- **`Home` is eager** (`router.tsx:5`) and imports `services/items` → the PO/SO/stock-history seeds → full-year replay on first paint. → lazy-load `Home` via the existing `page()` helper.
- **AppShell chain:** `services/companies.ts:5` → `inventoryMasters` → `masterData` → taxes/COA/compensation seeds. → move the `warehouses` collection to its own module with no `masterData` import.
- **`masterDefs.tsx`** (1050 lines, imported by 102 modules) pulls settings editors (`CurrenciesTab`, `ItemPricesTable`) into every document page. → split per master; keep editor components out of defs used by lookups.
- Optional: `manualChunks` in `vite.config.ts` putting `/src/mocks/` into a `seeds` chunk.

## Phase 2 — Data layer hot paths (`src/services/`)

> **Done 2026-10-26.** The benchmark changed the priorities. It ran the services under `tsx` with the store's 250 ms latency stubbed out and counted.
>
> - **CPU cost is small at this data size.** A cold item load with the history replay takes 132 ms. 5,000 `rateOn` calls take 45 ms, 5,000 `nameIn` calls under 1 ms, and 50 lineage lookups 3 ms.
> - **The time users wait comes from sequential 250 ms round trips on write paths.** Each `saveItem` re-listed the catalogue, then saved: two blocking waits. FIFO saved one layer per round trip.
>
> | Operation | Before | After |
> |---|---|---|
> | Item stock/cost updates from posting 20 lines | 40 blocking waits ≈ 10 s, plus 20 audit writes | 1 blocking wait ≈ 0.25 s, plus 1 audit write |
> | `saveItem` | 2 blocking waits, 95 ms CPU per 20 | 1 blocking wait, 3 ms CPU per 20 |
> | `consumeLayers` over 4 layers | 5 waits | 1 wait |
> | `updateFifoCosts` over 40 items | 2 waits + one save per changed item | 1 batched save (0 when nothing changed) |
> | Goods receipt post, 6 lines (total waits) | 24 | 8 |
> | Delivery post, 6 lines (total waits) | 24 | 16 |
>
> What changed:
> - **`store.ts`:**
>   - New `saveMany(rows)`: one wait, one storage write, one change notice. `save` now calls it.
>   - A write's audit events go into the log as one batch.
>   - The audit log no longer bumps `storeVersion`, so audited saves stop invalidating the document-graph caches. The new option is `invalidatesCaches: false`.
> - **`items.ts`:**
>   - `saveItem` checks barcodes and Item No. against `snapshot()`, not a fresh `list()`.
>   - New `saveItems(batch)`.
>   - `applyOrderedChange` writes in one batch.
> - **`costLayers.ts`:** layer reads use the snapshot, and writes are batched.
> - **Callers:** 14 `for … await saveItem(item)` loops in 11 posting services now make one `saveItems` call each. That includes the items × items loop in `apInvoices.ts` and `apCreditMemos.ts`. `applyInvoiceReturns` and `useCollectionRows.setActive` also batch now.
>
> **Bug fixed:** concurrent FIFO consumption lost stock.
> - `goodsReturns`, `arInvoices` and `salesReturns` cost their lines in `Promise.all`. Two lines of the same item and warehouse both read the layers before either saved, so the second save undid the first.
> - Reproduced: two concurrent 1-unit takes moved stock from 4 to 3, and both were costed off the same layer.
> - Layer writes now run one at a time (`inTurn` in `costLayers.ts`). Stock now goes 4 → 2, and the second unit is costed off the next layer.
>
> Verification:
> - `npm run typecheck` passes, all 13 `check-seeds` checks pass, and all 143 `test:e2e` tests pass.
> - FIFO check (sequential consumption, transfer, `removeLayersBySource`, `updateFifoCosts`): identical results on the old and new code, apart from the race fix.
> - Posting check (a standalone goods receipt plus a delivery: 8 items, 29 open layers, 181 consumptions): identical stock, costs, layers and consumption log on the old and new code.
>
> Not done, because it wouldn't pay off at this data size:
> - the store `Map` index;
> - `rateOn` binary search and the `nameIn` index;
> - a `lineage` index;
> - prev/next `listIds()`, whose list loads already run in parallel with the page's other loads;
> - capping the audit log, which is 6 KB after 40 saves.
>
> Notes for the commit:
> - Files: `store.ts`, `items.ts`, `costLayers.ts` and `useCollectionRows.ts`. Also 11 posting services: `apCreditMemos`, `apInvoices`, `arCreditMemos`, `arInvoices`, `deliveries`, `goodsReceipts`, `goodsReturns`, `inventoryCountings`, `inventoryTransfers`, `salesOrders` and `salesReturns`. All are under `src/services/`.
> - Four of them also hold other sessions' uncommitted tax work: `store.ts`, `apInvoices.ts`, `apCreditMemos.ts` and `arInvoices.ts`. Stage them by hunk. Phase 2's hunks are:
>   - in `store.ts`: `saveMany`/`writeMany`, `invalidatesCaches` and `recordAudit`;
>   - in the services: the `saveItems` import and the batched loops.
> - `CLAUDE.md` § Core data layer has a new rule: `saveMany`/`saveItems`, never `for … await save()`.
>
> Still sequential, but rare and small: `saveReceivedQuantities` per PO (usually one), `applyPayments` per credit-memo application, and `applyOrderedChange` per split PO.
> Other item saves still rebuild the document graphs: they bump `storeVersion` like any write. Fixing that would need tracking which collections each cache depends on.

**Original findings:**

- **Audit log** (`store.ts:208, 227`): empty seed → every event is dirty → full log re-`JSON.stringify`'d on every audited save, unbounded growth toward the localStorage quota; and its save bumps `storeVersion`, invalidating the document-link-graph caches on every save. → append-only/capped storage; audit writes don't bump `storeVersion`.
- **Store indexing** (`store.ts:136-160`): `get`/`save` are linear; `save` rebuilds the array; `persist` rebuilds a Map. → keep a `Map<id,T>` beside `loaded`; add `saveMany(records)` (one wait, one persist, one `changed()`).
- **O(N²) item loop** `apInvoices.ts:253,298`, `apCreditMemos.ts:192,259`: `items.find` per costing entry. → Map lookup, iterate only touched items.
- **`saveItem`** (`items.ts:84-125`) re-lists/clones the catalog per call; O(N·B²) barcode check; called in loops (`deliveries.ts:185,247`, `costLayers.ts:192`). → `saveItems(batch)` + barcode→id Map.
- **FIFO** (`costLayers.ts:92-195`): one `save` (250 ms + O(n)) per layer. → per item@warehouse index via `cachedUntilChange`, batch writes.
- **Per-line `items.find`** in posting services (deliveries, goodsReceipts, goodsReturns, salesReturns, arCreditMemos, withholding `:94,233`) → pass `itemById` Map in the posting ctx.
- **`rateOn`** (`masterData.ts:60-65`) filters+sorts all daily rates per call, called in render. → sort once per array ref, binary search.
- **`nameIn`** (`partnerMasters.ts:36`) linear per table cell. → `WeakMap<snapshotArray, Map>` index (auto-invalidates since `save` replaces the array).
- **`lineage()`** (`lineage.ts:26-37`) rebuilds indexes every call → build `{nodes, byKey, targetsOf}` inside the existing `cachedUntilChange` builders.
- Detail pages call `list()` (deep-clones whole collection) just for prev/next ids (22 pages, e.g. `PurchaseOrderDetail.tsx:189`); `ItemDetail.tsx:205,220` lists items twice. → `listIds()` / use `snapshot()`.

## Phase 3 — Seed/history build time (startup)

> **Done 2026-10-26. The measurements changed the target.**
>
> **1. History build (the original target): small, so only one fix is kept.**
> - In Node (with `tsx`), the history builds cost: `stockHistory()` about 95 ms, `seededLedger()` about 100 ms, `purchasingHistory()` about 24 ms. Importing the seed modules costs about 140 ms, which includes `tsx` transpiling them.
> - In the production build in Chromium, a whole cold page load scripts for only **about 170 ms**.
> - `stockHistory.ts` fixes, kept: `addLayer` and `movedIn` no longer copy their whole array on every append. The `oldestFirst` sort compares dates and layer numbers directly, where it used to call `localeCompare(…, { numeric: true })` once per take. Result: about 95 → 70 ms in Node.
> - Ledger fixes, reverted: an account `Map` and a cached collator in `ledgerHistory.ts` gave no measurable gain.
> - Most of the ledger's remaining cost is `arJournal` (about 62 ms, from `ctx.items.find` on every line) and the withholding code. Both are in `services/arInvoices.ts` and `withholding.ts`, which hold the tax-settings session's uncommitted work, so I left them. Passing an item `Map` into `arJournal`/`apJournal` is the follow-up once that work is committed.
> - The item merges in `purchasingHistory.ts`/`purchaseRequests.ts` and the `mocks/items.ts` family lookups were not worth changing at this size.
> - **Equivalence check:** the outputs of `purchasingHistory()`, `stockHistory()`, `seededLedger()`, the seeded items and the cost layers are hashed. The hashes match before and after.
>
> **2. What actually delays a cold load: React's Suspense throttle.**
> - Timeline of a cold load on the production build:
>   - HTML parsed at about 187 ms, and the page's code chunk loaded by about 170 ms.
>   - React shows AppShell's `Loading…` fallback, then holds it for its fallback throttle (about 300 ms; the minified `tg` timer of about 277 ms).
>   - The page only mounts and starts loading its data at about 505 ms.
> - Fix in `src/app/router.tsx`:
>   - `page()` now returns a component with a `preload()` method. Once the chunk is in, the component renders the page directly.
>   - `withPreload()` gives each page route a router `lazy` that awaits `preload()`, so the router loads the chunk before it renders the route. No fallback, no throttle.
>   - A chunk that fails to load still reaches the route's `errorElement` (`PageError`) inside the shell.
> - Result: the in-page time to the first table row, median of 7 cold loads on the production build:
>
> | Page | Before | After |
> |---|---|---|
> | Purchase orders list | 723 ms | 572 ms |
> | Items list | 815 ms | 659 ms |
> | Journal entries list | 913 ms | 749 ms |
> | Sales orders list | 711 ms | 564 ms |
> | Purchase order detail | 806 ms | 687 ms |
>
> What's left of a cold load is mostly the store's deliberate 250 ms fake latency, plus about 300 ms to load and start up.
>
> Seen along the way and left for Phase 4:
> - `useCurrentCompany` loads the company twice, once from AppShell and once from `DateSettings`.
> - Since Phase 1, the shell's warehouse list waits for its module import before it starts loading. Neither delays the page's own data.
>
> Verification:
> - `typecheck`, `build`, `lint` (0 errors) and `knip` all pass, along with all 13 `check-seeds` checks and all 143 `test:e2e` tests. That includes `lazy.spec.ts`, which checks that a page whose chunk fails to load shows the error with a reload inside the shell.
> - The history output hashes match before and after.
>
> Notes for the commit:
> - Files changed: `src/app/router.tsx` (`page()`, `withPreload`, and the `createHashRouter(withPreload([...]))` wrapper) and `src/services/stockHistory.ts`.
> - `CLAUDE.md` has a new note: declare pages with `page()`, never a bare `React.lazy`.

**Original findings:**

- `stockHistory.ts:98,116` linear finds per line; `:167,202-203` array copy per append (O(L²)); `:206` re-sort per take → Maps, `push`, keep sorted lists.
- `ledgerHistory.ts:292` `SEED_ACCOUNTS.find` per journal line → Map; `:191` `creditOn` rescans → bucket once.
- `purchasingHistory.ts:18` eager `mergedItems(SEED_ITEMS)` → move inside `build()`; plus finds at `:33,72,90,151`.
- `purchaseRequests.ts:161` re-runs `mergedItems` on every call; `snapshotItems()` re-merges per call → memoized `SEED_MERGED_ITEMS` / memo on snapshot ref.
- `mocks/items.ts:640-645` O(F·I·P) family lookups; eager IIFE seeds (`arInvoices.ts:524`, `storeSales.ts:158`, `deliveries.ts:378`) → shared `byId()` helper in `mocks/common.ts`; move heavy seeds behind `() =>` builders.
- Run `npx tsx scripts/check-seeds.ts` after; outputs must be byte-identical (seed values unchanged).

## Phase 4 — Render cost

> **Done 2026-10-26. Measured first; render cost turned out not to be a problem.**
>
> Interaction latency, measured with the Event Timing API (each interaction's slowest event, input to next paint). Production build, Chromium, **4× CPU throttling**, counting only interactions of 16 ms or more:
>
> | Interaction | Slow interactions | p50 | Max |
> |---|---|---|---|
> | PO list: type "macbook" in search | 6 | 32 ms | 80 ms |
> | PO list: sort by Total ×3 | 3 | 72 ms | 72 ms |
> | Items list: type "iphone 17" in search | 5 | 24 ms | 56 ms |
> | Item detail: type 20 characters in Description | 1 | 48 ms | 48 ms |
> | Item detail: type 20 characters in Remarks | 3 | 24 ms | 32 ms |
> | New PO: type 20 characters in Remarks | 14 | 16 ms | 40 ms |
> | JE list: type "payroll" in search | 5 | 24 ms | 40 ms |
>
> Google's "good" interaction threshold (INP) is 200 ms, and the worst case even when throttled is 80 ms. So none of the planned render work pays off: splitting `ItemDetail` per tab, memoising sort comparators and search text, or adding `React.memo`. I didn't do any of it.
>
> Done (cleanup):
> - `useCurrentCompany()` ran in both AppShell and `DateSettings`, so every start-up loaded the company twice. It also loaded the warehouse list twice and kept two sets of subscriptions. `DateSettings` now takes `company` from AppShell.
> - The date-picker format function is now a module-level constant (`formatPickerDate`), so the provider gets the same function every render. It still wraps `formatDate`, so the provider can't pass a second argument that overrides the user's format.
>
> Not done: the cancel guard on the detail pages' masters `Promise.all`. A late `setState` after unmount is ignored by React 18+, and detail pages remount per record (`key`), so a stale load can't land on the wrong record. This belongs in Phase 5's shared document-page hook.
>
> Verification:
> - `typecheck`, `build` and `lint` (0 errors) pass, along with all 143 `test:e2e` tests.
> - A trace of the store waits confirmed one company load per mount.
>
> Notes for the commit: `src/app/DateSettings.tsx` and `src/app/AppShell.tsx` (one line: `<DateSettings company={company}>`).

**Original findings:**

- `DateSettings.tsx`: inline `format={(iso)=>formatDate(iso)}` changes context value every render; `useCurrentCompany` loaded twice (here + AppShell). → pass `formatDate` directly; share one hook.
- List pages: `totalOf`/`effectiveStock` computed inside sort comparators (`PurchaseOrderList.tsx:72`, `ItemList.tsx:121`); search text rebuilt per keystroke. → precompute per row once per data load.
- `ItemDetail.tsx` (15+ `useState`s in one component) → split per tab so keystrokes don't rerender all tables.
- Masters `Promise.all` in detail pages lacks unmount/cancel guard (`PurchaseOrderDetail.tsx:202`).

## Phase 5 — De-duplication (maintainability)

> **Done 2026-10-26.** `src/` went from 508 files and 82,466 lines to 505 files and 81,567 lines. 15 files were removed, 12 shared ones added, and 148 changed.
>
> **1. Pickers that dropped a saved, since-deactivated value (the audit's one bug).**
> - New `services/taxCodeOptions.ts`: `taxCodeOptions(codes, direction, current)`.
> - It's used by all 14 line tax-code pickers. Each card's shared `taxOptions` constant became a per-row function. It's also used by the 4 freight-tax pickers.
> - `activeOptions` with the current value is also applied to:
>   - the journal entry tax code;
>   - PO and RFQ series;
>   - RFQ warehouses (keeps any warehouse a line already uses);
>   - the bin item group;
>   - payment currencies;
>   - incoming-payment bank, cash, control and postable accounts;
>   - A/R and reserve invoice revenue accounts.
> - Checked: a deactivated code is offered only to a line that already has it.
> - Not done: the condition-builder options in `services/allSeries.ts`. Their `options()` has no current value, so fixing them would mean changing the condition builder's API.
>
> **2. Shared helpers.**
> - `round2` (54 copies) and `round4` (11) → `services/num.ts`.
> - 10 hand-written day-arithmetic helpers → `addDays` in `services/dates.ts`: `plusDays` ×5, `dayBefore`, `nextDay` ×2, `nextDayOf`, `engine.addDays`, and `dueDateFor`'s body.
> - `lineNet`, `priceAfterDiscount` and `inventoryQty` → `services/lineMath.ts`. PO, PR and SO re-export them, so callers didn't change.
> - RFQ and quotation `lineNet` deliberately stay separate. They compute `q × u × (1 − d)`, the others `q × (u × (1 − d))`, and 16 of 4,976 test values round to a different centavo. No seeded line is affected.
> - `groupOf`, `revenueAccountFor` and `cogsAccountFor` (A/R, reserve invoice, A/R credit memo) → `services/itemAccounts.ts`. `deliveries.cogsAccountFor` has no `'5010'` fallback, so it stays separate.
> - `rateFrom` ×3 → `mocks/taxes.ts`, beside `rateAt`.
> - `onHand` → `stockTotals(item).inStock`.
> - `customerWithholdsRi` → `customerWithholds`.
> - `rowDiscount`, `rowSettled`, `meansTotal` and `weightedDueDate` (incoming and outgoing payments) → `services/paymentMath.ts`.
> - Not merged: `seriesOf` ×10, `saveReturnDraft`/`saveReturnRemarks` and the agreement services. Each is bound to its own collection or series. `openQty` also isn't merged: its meaning differs per document.
>
> **3. `'— None —'` and raw inputs.**
> - All 57 occurrences are gone. For `bind` fields the UI is unchanged, because the design system's `emptyState` already turned a blank option into a clearable field with "None". Raw `<Select>`/`<Combobox>` now get `clearable placeholder="None"`.
> - This was done with a TypeScript-API codemod plus about 25 hand edits.
> - The 3 raw `<input>`s became `TextField` and `Checkbox`. The 4 file inputs stay.
>
> **4. Document-page boilerplate** (`components/form/DetailNav.tsx`).
> - `useDocTab(path, tabParam)` replaces the tab setter and "redirect to /details" effect in 22 pages. Its redirect has correct dependencies and a once-per-mount ref, which removed 23 lint warnings.
> - `siblingKeys(all, numberOf)` replaces 17 copies of the Previous/Next sort.
> - `useReject()` replaces the reason box in 16 pages: two state variables, the alert markup and the cancel handler.
> - Not shared: `act()` (10 pages, about 7 lines each), `duplicate()`, masters loading, status menus and close-with-warning. Each carries its document's own fields and flow, so sharing them would add indirection without removing much.
>
> **5. File merges.**
> - `sales/shared/InvoiceContentsCard.tsx` (`kind="AR" | "RI"`) replaces `ArContentsCard` + `RiContentsCard` (383 + 365 lines). The A/R side keeps delivery copy-from, ATC display and ships-now stock; the reserve-invoice side keeps "Open for delivery" and ships-later.
> - `sales/shared/InvoiceCustomerDetailsPanel.tsx` replaces `ArCustomerDetailsPanel` + `RiCustomerDetailsPanel`.
> - `components/agreements/AgreementLinesCard.tsx` and `AgreementSummaryCard.tsx` (`side="purchase" | "sales"`) replace both lines cards (with their `lines/` tab folders) and both summary cards.
> - `sales/shared/BpChannelCard.tsx` replaces the A/R, delivery and sales-order copies.
> - `DocumentFlowTable` is shared by `DocumentFlow` and `SalesDocumentFlow`.
> - Not merged: the agreement list pages, which have drifted in UX (sales right-aligns and wraps, purchasing sorts dates), and the agreement detail pages and services, which are different documents.
>
> **Bugs found and fixed along the way:**
> - **List notices never showed.** `useListViews` mirrored the view and filter into the URL with `setParams(fn, { replace: true })` on every mount. Even unchanged, that navigation dropped the navigation state, so "Purchase order … rejected and returned to draft", "saved" and similar notices disappeared on arrival. It now only navigates when the URL actually changes. Verified in the browser.
> - The reject box's placeholder text varied by page; it's now one wording.
>
> **Visible changes, all intended:**
> - Optional raw pickers clear with ✕ instead of offering a "— None —" row.
> - The reject placeholder is unified.
> - The purchasing Transactions view now shows what a document covers when no lines are linked (it showed "—").
> - Sales Transactions totals use the shared `TableAmount` cell (same text).
> - List notices now appear.
>
> Verification:
> - Checks: `typecheck`, `build`, `lint` (0 errors, 12 warnings, all pre-existing patterns), `knip` (clean), all 13 `check-seeds` checks, all 143 `test:e2e` tests.
> - Seed fingerprint: identical (the seeded year is byte-for-byte the same).
> - Old-versus-new posting comparison: identical.
> - Browser comparisons against a build of the pre-Phase-5 source:
>   - A/R and reserve invoice Contents, with every column group switched on: identical.
>   - Purchase and sales agreements: identical.
>   - Transactions: only the intended "covers" change.
>   - Reject flow: works, and the notice now appears.
>
> Notes for the commit:
> - Phase 5 touches the tax-settings session's files, which the user approved: `ArContentsCard`/`RiContentsCard` (now merged and deleted), `arInvoices.ts`, `apInvoices.ts`, `apCreditMemos.ts`, `masterData`-adjacent pickers and `mocks/taxes.ts` (`rateFrom` added). Coordinate before committing.
> - The `knip.json` `ignoreIssues` list still covers that session's remaining files.

**Original findings:**

- **Shared helpers:** `round2` defined 54×, `round4` 9× → `services/num.ts`. ~10 hand-rolled add-days fns → `addDays` in `services/dates.ts`. `seriesOf` 10×, `openQty` 6×, `lineNet` 5×, `groupOf/revenueAccountFor/cogsAccountFor` 3×.
- **Tax-code pickers** copied 14× with `.filter(active).map` (drops a stale saved inactive value — a real bug per CLAUDE.md) → one `taxCodeOptions(m, direction, current)` using `activeOptions`. Same fix for series/warehouse/currency pickers (`PoDocumentCard.tsx:37`, `rfqDoc.tsx:61`, `PaymentDetail.tsx:382,397`…).
- **Document page hook:** 17–22 detail pages copy tab redirect, sibling prev/next, reject flow, `act()`, `duplicate()`, masters loading, status menu. → `useDocumentPage` + helpers (`useSiblings`, `useDocActions`, `duplicateDoc`, `docMenu`); ~80–120 lines saved per page.
- **Near-identical pairs:** `ArContentsCard`/`RiContentsCard` (317 shared lines), `Ar/RiCustomerDetailsPanel` (90/96), agreement `LinesCard` purchasing/sales (174/200), Blanket agreement list/detail/services/mocks, `incoming/outgoingPayments` (`rowDiscount`, `rowSettled`, `meansTotal`, `weightedDueDate` identical), `goodsReturns`/`salesReturns` (`saveReturnDraft/Remarks`).
- Replace `'— None —'` placeholder label (57× / 48 files) with picker `placeholder`, and fix 3 raw `<input>`s (`LcCostsCard.tsx:83`, `LcItemsCard.tsx:151`, `VariantPanel.tsx:119`).

## Phase 6 — Dead code & tooling

> **Done 2026-10-26.**
>
> Tooling (dev dependencies, each pinned to the newest release at least two weeks old):
> - `eslint` 10.12, `@eslint/js`, `typescript-eslint` 8.71, `eslint-plugin-react-hooks` 7.1 and `globals`. Run with `npm run lint`; config in `eslint.config.js`.
> - `knip` 6.41. Run with `npm run knip`; config in `knip.json`.
> - Lint settings:
>   - Recommended rules, plus the two classic hooks rules. The React Compiler rules are off, because the app doesn't use the compiler.
>   - `no-unused-vars` is off, because tsc's `noUnusedLocals` already covers it.
>   - Ternary and `&&` statements are allowed.
> - Result: lint gives 0 errors and 35 `exhaustive-deps` warnings. Nearly all of those are the copied run-once "redirect to /details" effect, which Phase 5's shared document-page hook removes. Knip is clean.
> - **Vitest is not added here.** `docs/test-plan.md` (another session's plan) owns `vitest.config.ts`, `src/test/setup.ts` and the `test` scripts.
>
> Dead code removed:
> - 4 unused files: `purchasing/shared/TotalRow.tsx`, `sales/deliveries/detail/DnJournalCard.tsx`, `sales/returns-and-credits/ReturnJournalCard.tsx` and `sales/sales-orders/detail/SoDeliveryTab.tsx`.
> - About 50 dead declarations, including:
>   - 9 `reset*` aliases;
>   - `saveRfq`, `markConvertedToPo`, `markConverted`, `layersFor`, `netDueRi`, `riInventoryAccount` and `runLabel`;
>   - the empty `SEED_*` arrays and the unused `masters.ts` id helpers;
>   - `seedRiNo`;
>   - the `dateCol` and `numberCol` builders;
>   - unused types and leftover re-export imports.
> - About 100 exports used only in their own file are no longer exported.
>
> What was kept, and why:
> - Exports with no caller yet that `docs/test-plan.md` plans to test are tagged `@public` so knip keeps them. Examples: `netArCredit`, `creditableSalesReturns`, `srTotals`, the price-list helpers, `balancesOf` and `describeChanges`. So are `seedPoNo` and `seedDnNo`, which `CLAUDE.md` names.
> - No seed data changed, so `SEED_VERSION` isn't bumped.
>
> Lint fixes:
> - Comma-expression statements became blocks.
> - A useless regex escape is gone.
> - Two `let open = 0` became `let open: number`, and one `let` became `const`.
> - Two stale `eslint-disable` comments were removed.
> - 4 intentional `MasterDef<any>`/`ComponentType<any>` uses now carry a reasoned disable comment.
>
> **Duplication removed:** `GoodsReturnsList.tsx` and `DebitMemosList.tsx` were the same file. Each had its `kind` flag replaced by literal `true`/`false`, so one branch was dead in each copy. Both are now thin wrappers over `purchasing/shared/ReturnDocumentsList.tsx`.
>
> Verification:
> - `typecheck`, `build`, `lint` (0 errors) and `knip` all pass, along with all 13 `check-seeds` checks and all 143 `test:e2e` tests.
> - Each list tab was checked in a browser. The check caught a bug in the first version of the merge: the `useMemo` destructuring `const [returns, …]` shadowed the new `returns` flag, so the memos tab listed goods returns. The flag is now `isReturns`, and each tab shows its own rows (`RTN-…` and `CM-…`).
>
> Notes for the commit:
> - Another session (`match-settings-record-header`) has uncommitted tax-settings edits. Its files are listed in `knip.json` → `ignoreIssues`, and **Phase 6 made no changes to any of them**. I restored the ones `knip --fix` had touched after confirming every difference was mine. Drop the `ignoreIssues` entries once that work is committed, then run `npm run knip` and fix what it reports.
> - New files: `eslint.config.js`, `knip.json` and `src/pages/purchasing/shared/ReturnDocumentsList.tsx`. Changed: `package.json` and `package-lock.json`. The 4 deleted files show as unstaged deletions.

**Original findings:**

- Delete unused files: `sales/deliveries/detail/DnJournalCard.tsx`, `sales/sales-orders/detail/SoDeliveryTab.tsx`, `sales/returns-and-credits/ReturnJournalCard.tsx`, `purchasing/shared/TotalRow.tsx` (update CLAUDE.md which still lists `TotalRow`).
- ~40 unused exports (e.g. `layersFor`, `saveRfq`, `markConverted`, 9 `reset*`, `seedRiNo`) and ~100 exports used only locally. Keep `seedDnNo` (CLAUDE.md names it).
- Add ESLint (typescript-eslint + react-hooks) and `knip` for unused exports; add Vitest for pure services (tax determination, withholding, totals) so refactors in phases 2–5 are safe.

---

## Recommended order
1 (done) → 2 (done; audit log + O(N²) + store Map) → 6 (done; tooling, so 3–5 have a safety net) → 3 (done) → 4 (done) → 5 (done). All phases done.

## Verification (each phase)
- `npm run typecheck` and `npm run build`; compare `dist/assets` chunk sizes before/after (current `dist/` is stale — rebuild first for a baseline).
- `npx tsx scripts/check-seeds.ts` — must still pass (phases 2–3).
- `npx tsx scripts/seed-fingerprint.ts` (hashes unchanged), plus `posting-check.ts` and `fifo-check.ts` diffed against a worktree of the code before the change.
- `node scripts/bundle-sizes.mjs` after `npm run build`, and `cold-load.mjs` / `interaction-latency.mjs` against `npx vite preview --port 4173`, compared with the figures in each phase.
- `npm run test:e2e` — every-screen sweep, lazy-load spec, references spec.
- Manual: post an A/P invoice and a delivery in `npm run dev`, confirm ledger/stock unchanged and posting is faster; check the Activity tab still shows audit events.
