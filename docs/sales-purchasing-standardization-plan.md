# Sales ↔ Purchasing Shared-Component Standardization

## Context

Sales (`src/pages/sales/`) and Purchasing (`src/pages/purchasing/`) are meant to mirror
each other structurally ("follow purchase"). An audit of the global components
(`src/components/`) and each module's `shared/` folder found the **framework level already
highly standardized** — every list page uses `useListPresets()` + `useListPage()`, every
detail page uses `PageHeader` / `DetailActions` / `DetailNav`, columns go through
`salesCols()` / `purchCols()` on the `ColBindings<T>` pattern, and blanket agreements on
both sides render the same `components/agreements/AgreementLinesCard`.

What the audit *did* surface is a handful of genuine drift points, all small and mostly
mechanical. This plan covers them. Two candidate findings were **investigated and rejected**
(see end) so we don't act on false positives.

### Decisions (confirmed)

| Decision | Choice |
|---|---|
| **Scope** | All four findings (F1–F4) |
| **Shared home (F2)** | New `src/pages/shared/` for cross-module document primitives; `documentView` lands here too |
| **Prefix direction (F4a)** | Match the `LIST_PATH` const — `AR_CM_*` (sales), `APRI_*` (purchasing) |
| **Delivery** | One PR per finding; order F4 → F1 → F3 → F2 |

### Guiding principle

Neither module should *own* a primitive the other depends on. Today sales reaches **into**
`purchasing/shared/` for shared engines (currency, document graph, copy hops). That works but
encodes a false ownership (purchasing "owns" currency conversion). Where a thing is truly
shared, it should live somewhere neutral; where it's duplicated, it should be merged.

---

## Finding 1 — `salesView` / `purchaseView` are duplicates

**Status: confirmed by reading both files in full.**

`src/pages/sales/shared/salesView.ts` and `src/pages/purchasing/shared/purchaseView.ts`
declare the same interface (`SalesView` ≡ `PurchaseView`, field-for-field) and the same body
line-for-line — only the doc comment and argument formatting differ:

```ts
// both:
const choices = currencyChoices(docCurrency);
const shown = choices.includes(value) ? value : docCurrency;
const conv = amountsIn(shown, docCurrency, fx, [], postingDate);
const converted = shown !== docCurrency;
const note = converted && !conv.factor ? `No ${docCurrency} exchange rate …` : undefined;
return { choices, shown, code: conv.code, converted, convert: (n) => n * conv.factor, onChange, note };
```

Sales already imports the engine (`amountsIn`, `currencyChoices`, `CurrencyToggle`) **from
purchasing** (`salesView.ts:2`). So this is one function copied into two homes.

**Plan.** Collapse into a single `documentView(docCurrency, fx, postingDate, value, onChange)`
in a neutral location (see Finding 2 for *where*). Export a `DocumentView` interface. Both
modules re-export under their existing names as thin aliases during migration, or callers
switch to `documentView` directly.

- Keep the two doc comments' intent ("sales/purchasing only ever offers doc currency + PHP")
  as one combined comment on the shared function.
- `CurrencyToggle` is already shared — only its *home* changes (Finding 2).

---

## Finding 2 — shared primitives live under `purchasing/shared/`, consumed by sales

**Status: confirmed by grep.** Sales imports these cross-module from purchasing:

| Imported by sales | Defined in | Sales importer |
|---|---|---|
| `CurrencyToggle`, `amountsIn`, `currencyChoices` | `purchasing/shared/CurrencyToggle.tsx` | `salesView.ts:2` |
| `DocumentFlowTable` | `purchasing/shared/DocumentFlow.tsx` | `SalesDocumentFlow.tsx:2` |
| `DocNode`, `CoveredLine`, `coveredLines` | `purchasing/shared/documentLinks.ts` | `salesDocumentLinks.ts:12` |
| `lineage`, `LinkedDocument` | `purchasing/shared/lineage.ts` | `salesDocumentLinks.ts:11` |
| `CopyHop`, `LinePick` | `purchasing/shared/copyHops.ts` | `copyHops.ts:8,21` |

None of these are purchasing-specific — they're document-graph / currency / copy-hop
machinery both modules sit on. The cross-module import direction is the only smell.

**Plan.** Introduce a neutral home — options to decide (see Questions):
- **A.** `src/pages/shared/` (new) for document-level cross-module primitives.
- **B.** `src/components/form/` (existing global home) for the UI-ish ones (`CurrencyToggle`,
  `DocumentFlowTable`) and `src/services/` for the data ones (`lineage`, `documentLinks`
  graph types, `copyHops` type).
- **C.** Leave as-is, accept purchasing-as-owner (lowest effort, documents the dependency
  with a comment instead of moving code).

Whichever we pick, `documentView` (Finding 1) lands in the same place as `CurrencyToggle`.

**Caution.** `documentLinks.ts` (423 lines) and `salesDocumentLinks.ts` (270 lines) each own
a module-specific `SOURCES` graph; only the **shared types + helpers** (`DocNode`,
`coveredLines`, `lineage`) move, not the per-module graphs. Moving touches imports in many
files — a mechanical but wide change. `knip` must stay at zero.

---

## Finding 3 — `InvoiceCustomerDetailsPanel` wrapper has no purchasing counterpart

**Status: confirmed.** Purchasing has one generic `VendorDetailsPanel<D extends
VendorDraftBase>` (191 lines). Sales has a concrete `CustomerDetailsPanel` (182 lines) **plus**
a 40-line `InvoiceCustomerDetailsPanel` wrapper whose only job is to drop the credit section
for invoice-type docs. The wrapper is used by two docs:

- `ArInvoiceDetail.tsx:482`
- `ReserveInvoiceDetail.tsx:466`

**Plan.** Make `CustomerDetailsPanel` render the credit section optionally (e.g. a
`showCredit` / `credit?` prop, matching how `VendorDetailsPanel` lets callers pass only the
sections they need), then delete `InvoiceCustomerDetailsPanel` and point the two invoice docs
at `CustomerDetailsPanel` directly with credit omitted.

- Preserve the wrapper's current call shape (`noun`, `remarkDefault`, `open`, `onClose`) so
  the two call sites change minimally.
- This removes a sales-only file and brings the sales panel closer to purchasing's
  one-generic-panel shape.

---

## Finding 4 — `paths.ts` naming + `StatusIntent` typing drift

**Status: confirmed by grep of both `paths.ts`.**

**4a — inconsistent prefixes.**
- Sales A/R credit memo: `AR_CM_LIST_PATH` but `ARCM_NOUN` / `ARCM_STATUS_INTENT`
  (`paths.ts:74-80`). Pick one: `AR_CM_*` throughout (matches the path const).
- Purchasing A/P reserve invoice: `APRI_LIST_PATH` / `APRI_NOUN` but `AP_RI_STATUS_INTENT`
  (`paths.ts:76-78`). Pick one: `APRI_*` throughout.

**4b — `StatusIntent` type alias barely used.** The alias exists in
`components/form/fields.tsx` and is applied in exactly **one** place
(`LC_STATUS_INTENT`, `purchasing/paths.ts:158`). Everywhere else inlines
`Record<XStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'>`, and
`QT_STATUS_INTENT` even uses `Record<string, …>` — which loses exhaustiveness over the
status keys.

**Plan.** Apply `Record<XStatus, StatusIntent>` to every `*_STATUS_INTENT` const in both
`paths.ts` files, importing `StatusIntent` from `components/form/fields`. Fix
`QT_STATUS_INTENT` from `Record<string, …>` to `Record<QuotationStatus, StatusIntent>` — this
may surface a missing/extra key, which is the point.

**Blast radius.** 4a renames two symbol families; update every importer (a few files each,
mechanical). 4b is type-only — no runtime change, `typecheck` proves it.

---

## Intentional differences — documented, not changed

These are correct design choices surfaced by the audit. Add a one-line comment at each so
they don't read as drift in future audits:

| Difference | Why it's correct |
|---|---|
| Purchasing has `ReferencesTable` (per-line source refs); sales has none | Sales surfaces lineage via `SalesDocumentFlow` (the graph), not per-line rows |
| Purchasing has `RequesterCard` / `RequesterDetailsPanel`; sales has none | Sales has no requester concept |
| `purchLineHelpers` is a superset (GL accounts, vendor options, blanket links) | Sales lines don't carry GL accounts or blanket agreements |
| `CustomerDetailsPanel` has a credit bar; `VendorDetailsPanel` has none | A/P has no vendor-credit concept |
| `VendorDetailsPanel` supports inline address add/edit via portals; sales reads fixed addresses | Purchasing creates/edits addresses during the document; sales reads existing ones |

Optional lower-value cleanup (not scheduled unless we're already in these files):
`copyLine` mappers in the two `copyHops.ts`, and `itemOptions` / `candidateItems` in the two
line-helper files, share near-identical logic that could be extracted — but the underlying
line *shapes* differ (sales minimal vs purchasing GL-aware), so the extraction earns little.

---

## Investigated and rejected (false positives)

- **"Blanket agreements are asymmetric — sales shows lines, purchasing doesn't."** False.
  Both `BlanketAgreementDetail.tsx:340` and `PurchaseBlanketAgreementDetail.tsx:340` render
  the same `AgreementLinesCard` (`side="sales"` / `side="purchase"`). Symmetric.
- **"`PurchTotalRow` is a redundant wrapper used nowhere else."** False. It's re-exported and
  used for domain-specific total rows (withholding, applied amount, balance/net due) across
  six docs: `poDoc`, `apDoc`, `apriDoc`, `dpiDoc`, `dprDoc`, `memoDoc`. Leave it.

---

## Suggested order

1. **Finding 4** (paths naming + `StatusIntent` typing) — lowest risk, type-checked, no UX change.
2. **Finding 1** (`documentView` merge) — small, self-contained.
3. **Finding 3** (generic `CustomerDetailsPanel`, drop wrapper) — one file removed, two call sites.
4. **Finding 2** (relocate shared primitives) — widest blast radius; do last, once a home is chosen.

Each is independently shippable.

---

## Verification (per step)

1. `npm run typecheck` — proves renames and `StatusIntent` exhaustiveness.
2. `npm run lint` — 0 errors.
3. `npm run knip` — stays zero (watch for a moved export losing its last caller; `@public` tag if needed).
4. `npm run build`.
5. `npm run test:e2e` — screen sweep catches a raw id leaking or a panel failing to open after the `CustomerDetailsPanel` change.
6. No `src/mocks/` change here, so `SEED_VERSION` and seed fingerprints are untouched.
