# Test plan — Sikat ERP (whole app)

## Context — is it covered today? No.

What runs now:

| Suite | What it proves |
|---|---|
| `npm run typecheck` | the types compile |
| `scripts/check-seeds.ts` | the seeded year ties out: purchasing documents, stock never negative, every entry balances, trial balance is zero, and the A/R, A/P, GRNI, supplier-advances and inventory accounts each equal their documents |
| `e2e/screens.spec.ts` | 114 URLs load with no raw ids or console errors. Only lists and **one sample detail per document**. |
| `activity`, `references`, `lazy`, `rfq` specs | about 15 targeted checks |

**Not covered:**
- No unit tests. About 200 pure business functions have no tests: totals, journals, FIFO, allocation, pricing, numbering, dates, filters, tax.
- No e2e test ever **creates, posts, copies or cancels** a document. Every workflow is untested.
- The smoke sweep skips:
  - every `/new` form, though the sales and purchasing ones are where most of the logic runs (only goods returns and transfer requests are covered)
  - every `:tab` on a detail page
  - about 40 settings tabs
  - `crm/leads/:id`
- `check-seeds` lacks several invariants, listed under Layer 2.

**Likely bugs to pin down with the first tests:**
1. `landedCosts.allocate` (`src/services/landedCosts.ts:41`) rounds each line on its own, so the lines can add up to a few cents more or less than the total.
2. Posting a landed cost (`addLandedCost`, `:65`) never updates cost batches, item cost or the ledger.
3. Purchase requests propose tax codes but `PurchaseRequestDetail` never calls `recalcLineTaxes`.

## Approach — 3 layers, in priority order

### Layer 1 — Unit tests (new: Vitest)

Vitest, not tsx, because `src/services/locations.ts:39` uses `import.meta.glob`.

Setup in `vitest.config.ts` + `src/test/setup.ts`:
- a Map-backed localStorage shim, as in `scripts/check-seeds.ts:10`, extended with key listing
- fake timers to skip the 250 ms service latency
- a frozen clock and time zone `Asia/Manila`
- `beforeEach` resets every collection

Tests live beside the services in `src/services/__tests__/<service>.test.ts`. Table-driven where possible.

| Area | Functions (file) | Key cases |
|---|---|---|
| **Core store** | `createCollection`, `cachedUntilChange`, `describeChanges`, `saveMany`, the `SEED_VERSION` purge (`store.ts`); `saveItems` (`items.ts`) | only the diff is persisted; a batched save writes once and bumps the version once; saved changes merge in seed order; new rows go last; `reset`; the cache is invalidated on write; an audit entry is recorded; an old version is purged |
| **Dates/format** | `formatDate`, `formatDateTime`, `todayISO`, `nowHHMM` (`dates.ts`); `formatAmount`, `initialsOf` (`format.ts`); `parseBspBulletin` (`masterData.ts:100`) | all 4 date formats; UTC 00:00–08:00 is still yesterday in Manila; en-PH amounts; a real BSP bulletin sample |
| **Numbering** | `formatDocNum`, `matchingSeries`, `seriesLookup` (`allSeries.ts`) | segments, padding, the Draft placeholder, year/month roll-over |
| **Filters** | `parseFilter`/`formatFilter` (`components/filter/aip160.ts`), `applyFilter`, `matches`, the encode/decode round-trip (`engine.ts`), `filterRows` (`listQuery.ts`) | every operator; an invalid filter throws `InvalidFilterError`; a round-trip returns the same filter |
| **Pricing** | `determinePrice`, `priceChain`, `calculatedItemPrice`, `tierFor`, `specialTerms`, `isPriceListValid`, `roundPrice` (`priceLists.ts`) | base-list chains, including a cycle; volume tiers; a special price beats the list; validity dates |
| **Sales docs** | `soTotals`, `lineNet`, `lineTax`, `soDueDate`, `openQty`; `qtTotals`/`dnTotals`/`arTotals`/`riTotals`/`srTotals`/`arCmTotals`; `balanceDue`, `riBalanceDue`, `netArCredit`, `installmentSchedule`, `creditableSalesReturns`, `dnOpenQty`, `srOpenQty`; `blanketAgreements` totals and open amounts | header discount, freight, rounding; a VAT rate by posting date; partially delivered or invoiced documents |
| **Incoming / outgoing payments** | `allocateInSequence`, `rowDiscount`, `rowSettled`, `amountDue`, `paymentDifference`, `weightedDueDate` (`incomingPayments.ts`); `overallAmount`, `meansBalance`, `rowFxDifference`, `paymentJournal` (`outgoingPayments.ts`) | a partial allocation; a cash discount; the FX difference is 0 on down-payment rows |
| **Purchasing docs** | `poTotals`, `dueDateFor`, `prTotals`, `rfqTotals`, `apTotals`, `netDue`, `movesStock`, `returnableQty`, `returnOpenQty`, `netCredit`, `sendsStock`, `drawableAmount`, `drawDownPayments`, `applyToOrders`, `grOpenQty`, `unitCostLc`, `findDuplicateVendorRef`, `findDuplicateInvoice`, `recalculatePBACommitments` | a partial receipt closes, and reopens on cancel; down payments close and reopen within 0.005 |
| **Journals** (all must balance) | `dnJournal`, `arJournal`, `riJournal`, `srJournal`, `arCmJournal`, `incomingJournal`, `grJournal`, `apJournal`, `memoJournal`, `postingJournal`, `transferJournal` | revenue/COGS account by item, then item group, then the 4010/5010 fallbacks; debits equal credits |
| **Copy from base** | `srLineFromDelivery`, `arCreditMemoFromInvoice`/`FromReturn`; `returnFromReceipt`, `returnFromInvoice`, `memoFromInvoice`, `memoFromReturn` (`purchasing/shared/returnsTypes.ts`); the sales `detail/types.ts` copy helpers (`dnLineFromOrder`, `arLineFromDelivery`…); `lineage`, `coveredLines` | quantities, prices, tax code, `baseId`/`baseType` all carried over; only the open quantity is copied |
| **Inventory** | `consumeLayers` and its `inTurn` queue, `transferLayers`, `updateFifoCosts` (`costLayers.ts`); `allocate` (`landedCosts.ts`); `countVariance`, `postingVariance`, `variancePct`, `postingFromCount`, `stockAfter`; `qtyByItem`, `shortages`; `binStock`, `transferBlock`, `fillPattern`, `planGeneration`, `planRename`; `stockTotals`, `isLowStock`; `mergedItems` (`mocks/items.ts:292`) | FIFO fallbacks; two concurrent `consumeLayers` calls for the same item and warehouse both deduct (4 → 2, not 4 → 3; see `docs/codebase-audit.md`); transfers keep the batch dates; **allocations add up to the total** (bug 1); variance when stock is 0; a variant inherits tax, G/L accounts and UoM |
| **Accounting** | `jeTotals`, `balancesOf`, `postingPeriodProblem`, `withAutoTax`, `lineProblems`, `parseJeRows`, `controlAccountOf` (`journalEntries.ts`); `voucherState`, `toJournalEntry`; `erdTotals`, `erdLines`, `openForeignRows`, `defaultRates`; `usageCount`; `defaultJournalRemark` | the full validation matrix: title account, inactive account, control account, closed period, period 13, missing dimension |
| **Tax** | `determineTax`, `determineWithholding` (`taxDetermination.ts`); `recalcLineTaxes`, `editTaxCode`, `lineAtc`, `withTaxFiling` (`taxRecalc.ts`); `lineWithholdings`, `totalWithholding`, `stampWithholding`, `resolveCustomerWithholding`, `customerWithholds`, `withIncomeType` (`withholding.ts`); `blockedDeactivation` (`taxUsage.ts`) | VAT / zero-rated / exempt × customer status; a non-VAT company falls back to `percentageTaxCode` or `PT`; `IVAT`/`IVAT-S`/`IVAT-C`; withholding comes from the item, else the account, else the vendor override, else none; payee tier; reverse charge isn't deducted; stamped values survive a Settings change; recalc leaves overridden and copied lines alone |
| **People / CRM / partners** | `employeeName`; `getApprovalRule`, `approverName`; partner `isActive`, `defaultContact`, `defaultBillTo`; `isOpenTask`, `isOverdue` | name order; active-date ranges |

### Layer 2 — Seed invariants (extend `scripts/check-seeds.ts`)

Add one `check(...)` per invariant, next to the existing ones:
- **Orders against receipts and deliveries.** A PO's received qty equals its receipt lines. An SO's delivered and invoiced qty equal its delivery and invoice lines. Closed status matches what's left open.
- **Returns.** Returned qty on receipts and invoices equals the goods-return lines. The same holds for sales returns.
- **Requests.** Purchase-request and transfer-request open qty equals quantity minus what was copied.
- **Blanket agreements.** Committed amounts equal the linked orders, for sales and purchasing.
- **Cost batches.** What's left per item and warehouse equals stock on hand. Item cost equals the weighted average of its batches.
- **Bins.** Stock in bins never exceeds warehouse stock.
- **Transfers and counts.** Transfers don't change total quantity. After a count posts, stock equals the counted quantity.
- **Landed costs.** Line allocations add up to the cost total.
- **Numbering.** Document numbers are unique within each series.
- **Tax.**
  - a posted AP invoice's `withholdingSummary` equals the total of its `lineWithholding`
  - a stamped `taxAtc` matches the code it posted with
  - no service line or service expense account still points at `IVAT`

### Layer 3 — E2E (Playwright)

**3a. Widen the smoke sweep** (`e2e/screens.spec.ts`):
- every `/new` route
- one `:tab` per detail page
- every settings tab, listed above in Context
- `crm/leads/:id`
- a variant item
- `settings` (a redirect) and `*` (the placeholder page)

Generate the list from the router where practical, so new routes can't be missed.

**3b. Workflow specs**, one file per area: `e2e/{sales,purchasing,inventory,accounting,settings,tax}.flows.spec.ts`.

Each spec starts on a fresh localStorage and reuses `open`, `watchErrors` and `rawIds` from `e2e/helpers.ts`. The shared steps (pick a partner, add a line, post, copy to) go in `e2e/helpers.ts`. The sales stories in `docs/*-user-stories.md` (41 stories, 166 acceptance criteria) map to tests one to one. Tag each test with its US id.

- **Sales:**
  - quotation → sales order: the quotation closes
  - sales order: warnings for a duplicate customer reference and for the credit limit
  - sales order → delivery: delivered qty moves; the order closes when fully delivered
  - delivery: blocked when stock is short
  - delivery → invoice
  - incoming payment: allocated across invoices; an invoice at zero closes; cancelling restores the balance
  - sales return → credit memo: reduces the invoice's open amount
  - reserve invoice → delivery
  - blanket agreement: commitments update
  - price lists: a chain, tiers and special prices reach the order line
- **Purchasing:**
  - the full chain: purchase request → RFQ → PO → receipt → vendor invoice → payment, checking the document-flow panel at each step
  - partial receipt: a second receipt closes the PO; cancelling one reopens it
  - goods return → debit memo
  - down payment: request → payment → invoice drawdown; cancelling reopens it
  - approval: Not Confirmed → approve or reject in the approvals inbox
  - duplicate vendor-reference warning
  - landed cost (bug 2)
- **Inventory:**
  - transfer request → transfer; a shortage blocks it
  - stock count → posting; items in an open count are frozen
  - bin generate and rename
  - variant stock rolls up to the parent
- **Accounting:**
  - journal entry validation: unbalanced, title or control account, closed period
  - post, then reverse
  - import rows from Excel
  - voucher → post the selected entries
  - exchange-rate differences run, with its reversal
  - the account balance panel reflects new postings
- **Settings / core:**
  - master data create, rename, deactivate; deactivation blocked while in use
  - PSGC cascade
  - BSP bulletin import
  - document-numbering segments drive the next number
  - preferences: date format and time zone re-render the lists
  - filter presets: save, reload, apply, delete; the URL keeps the filter
  - employee create and edit; the display name follows the name-order setting
  - lead → customer conversion
- **Tax:**
  - partner or date change re-proposes tax codes; an overridden line stays (across all 16 documents)
  - copied lines are dropped on partner change
  - AR withholding moves on drafts only
  - withholding falls back to the account default on account-only lines
  - the VAT ATC stamp survives a later Settings edit
  - `IVAT-S`/`IVAT-C` are proposed for service and capital items
  - a non-VAT company proposes `PT-060`, or `PT` when cleared

## Files
- **Create:**
  - `vitest.config.ts`
  - `src/test/setup.ts`
  - `src/services/__tests__/*.test.ts`, plus `src/components/filter/__tests__/` and the purchasing/sales helper tests beside their modules
  - `e2e/*.flows.spec.ts`
  - `docs/test-plan.md`: this plan plus a coverage matrix, kept current
- **Modify:**
  - `package.json`: `vitest` and `@vitest/coverage-v8` devDependencies; `"test": "vitest run"` and `"test:coverage"` scripts. The codebase-audit session is also adding ESLint and knip to `package.json` (`"lint"`, `"knip"`), so merge with its changes rather than overwrite them.
  - `scripts/check-seeds.ts`
  - `e2e/screens.spec.ts`, `e2e/helpers.ts`
  - `CLAUDE.md`: the Commands section
- **Bug fixes:** land each one with the test that pins it: landed-cost allocation and posting, and the purchase-request recalc.

**Concurrency:** another session is changing `store.ts`, `apInvoices.ts`, `apCreditMemos.ts`, `items.ts`, `costLayers.ts`, `masterData.ts`, `partnerMasters.ts` and the `lineage.ts` files. Tests only import these, so there's no edit conflict. Before deleting an unused export, that session checks it isn't listed here (for example `netArCredit` and `creditableSalesReturns`, which have no callers yet). Run the suites again after that session lands its changes.

## Rollout order
1. Vitest setup, then core (store, dates, numbering, filters), tax and journals. Tax and journals carry the most risk.
2. Unit tests for the sales, purchasing and inventory calculations, fixing the bugs as they turn up.
3. The `check-seeds` invariants.
4. The wider smoke sweep.
5. The workflow specs: purchasing chain, sales chain, accounting, inventory, settings, tax.

Target: 80%+ line coverage on `src/services/` (`npm run test:coverage`), and at least one flow spec per document type.

## Verification
- `npm run typecheck && npm test && npx tsx scripts/check-seeds.ts && npm run test:e2e`: all green, apart from known-bug tests marked `test.fails` until their fix lands.
- Mutation sanity check: temporarily break three guards and confirm the suites go red, then restore each one:
  - the `taxOverridden` check in `recalcLineTaxes`
  - the balance check in `lineProblems`
  - the reopen-on-cancel in `applyToOrders`

---

## Progress (as of 2026-10-26)

**Done**
- **Harness** — `vitest.config.ts`, `src/test/setup.ts` (localStorage shim with key listing, frozen Asia/Manila clock, ~0 latency, 30s timeout for stock-flow tests), `npm test` / `test:coverage`, CLAUDE.md. `coverage/` untracked + gitignored.
- **Layer 1** — 24 test files, **3,571 tests**, all green: store, dates, format, numbering, filters, pricing, sales/purchasing totals, journals (balance across every seed doc), copy-from-base, inventory/costLayers (+ concurrency), counts/bins/mergedItems, accounting validation matrix, tax, people/CRM; plus service **workflow** tests (post/cancel/copy/drawdown) for sales, purchasing and inventory/accounting.
- **Coverage** — `src/services` **89.6% lines / 84.9% branch** (target 80%). `mocks` 97.9%. (`companies.ts` 57% — rest is a React hook, needs jsdom; `xlsx.ts` / `locations.ts` excluded as noted.)
- **Layer 2** — `check-seeds.ts` extended 14 → **22 invariants** (orders vs fulfilment/returns, requests, blanket commitments, cost batches vs stock + weighted avg, bins, transfers/counts, landed-cost sum, unique doc numbers, withholding/ATC/service-VAT).
- **Layer 3a** — smoke sweep widened **114 → 221 URLs** (every `/new`, one `:tab` per detail, all settings tabs, crm lead, variant item, redirect, placeholder), generated from the router/nav.
- **Mutation sanity** — all three guards confirmed: breaking each turns the suite red (verified + restored).
- **Bugs** (all resolved): (1) `landedCosts.allocate` rounding — **fixed**; (2) `addLandedCost` posting — **fixed** (see Landed cost below); (3) PR `recalcLineTaxes` — **not a defect**. Also found + **fixed**: `SoLinesCard` passing `onColumnSettings` to the raw `<Table>`; `saveItems` not rejecting two new rows sharing an Item No.; the delivery/SO "Copy to A/R invoice" **dead route** (`/sales/invoices/new` → `/sales/customer-invoices/new`); and a **debit-memo regression** the lines-table refactor introduced (lost Activity/Transactions tabs) — restored.
- **Layer 3b** — Playwright workflow specs: `e2e/sales.flows.spec.ts` (6) + `e2e/purchasing.flows.spec.ts` (7), green and stable. Also covered at the service level (salesFlows/purchasingFlows/inventoryAccountingFlows).
- **Landed cost** — `addLandedCost` now capitalizes its allocation into inventory (moving-average item cost) and the derived ledger posts it (Dr Inventory / Cr Accrued Expenses). The seeded books fold the same amount into the receipt's cost layers, so it flows to COGS when the units sell. Tie-out holds (1310 == stock at cost; new invariant "Posted landed costs capitalize their full allocation to inventory"). The `it.fails` pin is flipped.

**Remaining**
- Purchasing / inventory / accounting / settings / tax **UI** workflow specs beyond the sales + purchasing chains (nice-to-have; those workflows are already covered at the service level).
