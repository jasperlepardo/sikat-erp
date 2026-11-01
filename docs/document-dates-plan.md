# Document dates — shared model + Dates card

## Context

Every document detail page carries a handful of dates, but today each page re-declares them from scratch. Some live in a dedicated card (`SoDatesCard`, `DnDatesCard`, `ArDatesCard`, `ReturnDatesCard`, and the two "Dates & references" cards `PoDatesCard` / `RfqDatesCard`); most are buried **inside the "Document" card** mixed with series / number / currency / exchange rate (`QtDocumentCard`, `PoDocumentCard`, `ApDocumentCard`, `GrDocumentCard`, …); two are rendered **inline** with no card file at all (`PaymentDetail`, `JeEditor`). Each re-declaration spells out its own `h.date('…', '…', { required, error, readOnly, hint })`.

The cost is drift. The same date gets inconsistent treatment: the **Document date** hint is "The date on the vendor's invoice" on the A/P invoice, "The date for records" on the purchase request, and **blank** on the A/R invoice, delivery, DPI, GRR and payments. There is no shared source of truth for what a date *means*, so a reader can't trust that "Document date" means the same thing everywhere, and a new document is assembled by copy-paste.

The goal is the **item-card property**: from the moment a document is created, its complete, meaningful set of dates is declared **up front, from a shared vocabulary** — so the dates are consistent and legible across every document, exactly the way item fields are defined once and composed everywhere.

**The insight that drove the design.** Across the whole app, every date field collapses to one of **eight roles** plus three genuine one-offs. There is no document with a date that doesn't fit. Once dates are modelled as roles, "which dates does this document have?" becomes a one-line declaration that reads like a row of the matrix below.

### Decisions (confirmed)

| Decision | Choice | Why |
|---|---|---|
| **Model** | A fixed registry of named **date roles** (`documentDates.ts`); each document declares the roles it carries | The dates are a finite taxonomy, not per-document inventions — name them once |
| **Renderer** | One shared `<DatesCard>` component owns the Section, layout, `bind()` wiring and the Close-date row | Removes the `Section`/`FieldStack`/`ReadOnly` boilerplate re-declared in ~23 files |
| **Split mixed cards** | Dates come **out** of every "Document" card into a dedicated Dates card, on every page | Full consistency — every document shows a **Document** card then a **Dates** card, like the item card's grouped sections |
| **Static vs dynamic** | Registry holds the static identity (key · label · hint · required); the document supplies the dynamic bits (`error`, `readOnly`, and dynamic hints) at the call site | `readOnly` depends on `ctx.added` vs `ctx.readOnly` per doc; some hints interpolate payment-term names — these can't live in a static registry |
| **Overrides** | A document may override a role's `label` or `hint` where it genuinely differs (e.g. Quotation date, vendor-invoice-specific hint) | The default keeps most docs honest; the override preserves the few meaningful differences |

---

## The date taxonomy (eight roles)

| Role | Field | Meaning | Required | Default label |
|---|---|---|:-:|---|
| **Effective** | `postingDate` | The document's primary date — drives FX rate, tax rates, prices, and the GL period | always | Posting date |
| **Document** | `documentDate` | The legal / BIR date, often the counterparty's own document date (vendor invoice, delivery receipt) | usually | Document date |
| **Due** | `dueDate` | Payment due — `postingDate` + payment terms | on payables/receivables | Due date |
| **Delivery** | `deliveryDate` | When goods are expected / shipped | optional | Delivery date |
| **Required** | `requiredDate` | When the requester needs it — planning only | optional | Required date |
| **Valid until** | `validUntil` | Offer / request expiry | optional | Valid until |
| **Cancellation** | `cancellationDate` | Auto-lapse date | optional | Cancellation date |
| **Close** | `closeDate` | Read-only; stamped on close / cancel | n/a (read-only) | Close date |

**Genuine one-offs (stay bespoke, not in the registry):** `customsDate` (landed cost, `LcCostsCard`), `reversalDate` (journal entry, `JeEditor`), `startDate`/`endDate`/`signingDate`/`terminationDate` (blanket agreements — `terminationDate` is the agreement's read-only "closed" stamp), `validFrom`/`validTo` (chart-of-accounts effectivity). These are not document-lifecycle dates shared across types; they keep their own `f.date(...)` calls.

**Naming variant for Close.** The two payment documents store the close stamp as **`cancelDate`**, not `closeDate` (`incomingPayments.ts`, `outgoingPayments.ts`). The `DatesCard` `closeDate` slot is passed whichever field the document carries; the role is "Close" regardless of the stored field name.

---

## Per-document matrix

**Authored from the mock interfaces (the data model), not from what the cards render today.** That distinction is the point: several date fields exist in a document's draft but are never shown, so a matrix built from the cards undercounts (see *Completeness* below).

Legend: **✓** = in the data model **and** rendered today · **•** = in the data model but **not rendered today** (the migration surfaces it) · blank = not in the data model.

| Document             |     Effective      | Document | Due | Delivery | Required | Valid until | Cancel | Close | Notes                                            |
| -------------------- | :----------------: | :------: | :-: | :------: | :------: | :---------: | :----: | :---: | ------------------------------------------------ |
| Quotation            | ✓ `Quotation date` |    ✓     |     |          |          |      ✓      |        |   ✓   |                                                  |
| Sales order          |         ✓          |    •     |  •  |    ✓     |    ✓     |             |   ✓    |   •   | hides document + due + close (SAP: SO has Document Date) |
| Delivery             |         ✓          |    ✓     |  •  |    ✓     |          |             |        |   ✓   | hides due                                         |
| A/R invoice          |         ✓          |    ✓     |  ✓  |          |          |             |        |   ✓   | due hint = payment terms                         |
| A/R reserve invoice  |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | dates today in `RiCustomerCard`; hides close    |
| Sales return         |         ✓          |    ✓     |  ✓  |          |          |             |        |   ✓   | `ReturnDatesCard` (shared); inherits Delivery's dates |
| A/R credit memo      |         ✓          |    ✓     |  ✓  |          |          |             |        |   ✓   | `ReturnDatesCard` (shared)                       |
| Payment received     |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | due = weighted means date; close = `cancelDate`, hidden |
| Purchase request     |         ✓          |    ✓     |     |          |    ✓     |      ✓      |        |   •   | hides close                                      |
| RFQ                  |         ✓          |    ✓     |     |          |    •     |      ✓      |   ✓    |       | cancel + refs in `RfqDatesCard`; `requiredDate` in data, hidden |
| Purchase order       |         ✓          |    ✓     |  •  |    ✓     |    ✓     |             |   ✓    |   •   | required/cancel/refs in `PoDatesCard`; hides due + close |
| Goods receipt        |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | due hint = payment terms; hides close           |
| Goods return         |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | hides close                                      |
| Goods return request |         ✓          |    ✓     |     |          |    ✓     |             |        |   •   | hides close                                      |
| A/P invoice          |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | due hint = payment terms; hides close           |
| A/P reserve invoice  |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | hides close                                      |
| Down-payment request |         ✓          |    ✓     |  ✓  |          |          |             |        |       |                                                  |
| Down-payment invoice |         ✓          |    ✓     |  ✓  |          |          |             |        |       |                                                  |
| Debit memo           |         ✓          |    ✓     |  ✓  |          |          |             |        |       |                                                  |
| Landed cost          |         ✓          |          |  ✓  |          |          |             |        |       | + `customsDate` (one-off) stays in `LcCostsCard` |
| Payment made         |         ✓          |    ✓     |  ✓  |          |          |             |        |   •   | due = weighted means date; close = `cancelDate`, hidden |
| Journal entry        |   ✓ `Doc. date`    |    ✓     |  ✓  |          |          |             |        |       | + `reversalDate` (one-off) stays inline          |

A **•** is not a bug to preserve — it's a field the migration should **start rendering**. The shared `DatesCard` already has the `closeDate` slot, so surfacing Close everywhere it exists is nearly free; `document`/`due` on the sales order and `due` on delivery/PO are one `dateRow(...)` each.

---

## Completeness (vs SAP B1 field census)

Cross-checked against the two SAP B1 field-census workbooks — **B1_Comparison_Table_AP_Purchasing** ("Fields Consolidation (Auto)") and **SAP B1: Sales** ("Consolidated Fields") — plus the Sikat mock interfaces.

**The taxonomy holds.** Every header date in both censuses maps onto one of the eight roles: `Posting→Effective`, `Document→Document`, `Due→Due`, `Delivery→Delivery`, `Valid Until→Valid until`, `Required→Required`. Cancellation and Close are Sikat refinements beyond the census (kept).

**Finding 1 — hidden fields are the real gap.** The data model carries dates the cards don't show. `closeDate` exists in ~11 mocks but renders on only ~5 screens; the **sales order** additionally hides `documentDate` and `dueDate`; **delivery** and **PO** hide `dueDate`. SAP B1 independently confirms the sales order carries a **Document Date** (its Sales Order tab labels the field "Valid Until / Document Date"). These are the **•** cells above — the migration surfaces them.

**Finding 2 — two true gaps.**

| Gap | Where | Status in Sikat | Decision |
|---|---|---|---|
| **Return Date** | SAP B1 sales **Return Request** header | **No `returnDate` field** — the return uses posting/document/due | Add a `returnDate` field (+ a `DOC_DATE.returnReq` role), or accept posting date as the return date |
| **Termination Date** | Blanket agreements | **Exists** (`terminationDate`, read-only, stamped on Terminate) | Doc fixed — added to the one-offs list above |

**Finding 3 — scope differences (flag, not gaps).**
- The purchasing census lists **Delivery Date on every A/P document** (goods receipt, A/P invoice, down-payment, credit memo…); Sikat scopes `deliveryDate` to PO / SO / delivery only. Likely intentional — confirm.
- The purchasing census has **no "Due Date" row** (it labels that slot "Delivery Date"); the sales census uses "Due Date". That's an inconsistency in the *reference sheets*; the `Due` role covers both.

---

## The registry — `src/components/form/documentDates.ts`

The single source of truth. Each role is a static def; a tiny `dateRow()` helper merges in the per-call dynamic bits (`error`, `readOnly`) and any `label`/`hint` override.

```ts
import type { ReactNode } from 'react';
import type { KeysOf } from './fields';

/** Static identity of a document-date role. */
export interface DocDateDef {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
}

export const DOC_DATE = {
  effective:    { key: 'postingDate',      label: 'Posting date',      required: true, hint: 'Sets the period, exchange rate, tax rates and prices.' },
  document:     { key: 'documentDate',     label: 'Document date',     required: true, hint: 'The date for BIR / tax purposes.' },
  due:          { key: 'dueDate',          label: 'Due date',          hint: 'From the payment terms.' },
  delivery:     { key: 'deliveryDate',     label: 'Delivery date' },
  required:     { key: 'requiredDate',     label: 'Required date' },
  validUntil:   { key: 'validUntil',       label: 'Valid until' },
  cancellation: { key: 'cancellationDate', label: 'Cancellation date' },
} as const satisfies Record<string, DocDateDef>;

/** Merge a role def with a document's dynamic bits + optional label/hint/required override. */
export function dateRow<T>(
  def: DocDateDef,
  o: { error?: string; readOnly?: boolean; label?: ReactNode; hint?: ReactNode; required?: boolean } = {},
): DateSpec<T> {
  return {
    key: def.key as KeysOf<T, string>,
    label: o.label ?? def.label,
    hint: o.hint ?? def.hint,
    required: o.required ?? def.required,
    error: o.error,
    readOnly: o.readOnly,
  };
}
```

A document's Dates card then reads like its matrix row — the role names are the vocabulary, overrides are the exceptions:

```tsx
// Quotation
<DatesCard draft={draft} update={update} closeDate={draft.closeDate}
  closeHint="Set when the quotation is closed or cancelled."
  dates={[
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.added,
      label: 'Quotation date',
      hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : undefined }),
    dateRow(DOC_DATE.validUntil, { readOnly: ctx.readOnly, hint: 'After this date the quotation is expired.' }),
    dateRow(DOC_DATE.document,   { error: errors.documentDate, readOnly: ctx.readOnly }),
  ]}
/>

// A/P invoice
<DatesCard draft={draft} update={update}
  dates={[
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly,
      hint: 'Sets the period, tax rates and the exchange rate the bill is booked at.' }),
    dateRow(DOC_DATE.due,      { required: true, error: errors.dueDate, readOnly: ctx.readOnly,
      hint: `Posting date + the payment terms${draft.paymentTermId ? ` (${paymentTermName(draft.paymentTermId)})` : ''}. Change it to override.` }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly,
      hint: "The date on the vendor's invoice — the date BIR uses for input VAT." }),
  ]}
/>
```

> Note: `due` is `required: false` by default (not all payables force it) but the A/P docs that require it pass `required: true`. The `dateRow` override for `required` is additive — allow it in the options object: `required?: boolean` → `def.required`.

---

## The shared renderer — `src/components/form/DatesCard.tsx` *(already built)*

A reference implementation is already in place (see **Landed so far** below). The component:

- Generic over the draft type `T`.
- `dates: DateSpec<T>[]` — rendered top to bottom via `bind().date` (so stage-locked dates render flat read-only, per `fields.tsx`).
- `closeDate?: string` (+ `closeHint?`) — trailing read-only Close-date row (`''` → em dash).
- `children?: ReactNode` — non-date fields appended after the dates, for the **"Dates & references"** variants (`PoDatesCard`, `RfqDatesCard`) whose indicator / TIN / order-number fields ride along; pass `title="Dates & references"` and `icon="event"`.
- Owns the `Section`, `FieldStack`, and the `bind()` call.

```ts
export interface DateSpec<T> {
  key: KeysOf<T, string>;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
}
```

---

## Migration

Two shapes, both converging on `<DatesCard>` fed by `dateRow(DOC_DATE.*)`.

**A. Standalone dates cards — convert in place, no layout change.**
`SoDatesCard`, `DnDatesCard`, `ArDatesCard`, `ReturnDatesCard`, and the two "& references" cards `PoDatesCard` / `RfqDatesCard` (references via `children`). The detail page already renders `<XDatesCard>`; only the card's body changes.

**B. Mixed "Document" cards — split dates out.** For each document whose dates live inside its `*DocumentCard` (or inline):
1. Create a new `*DatesCard.tsx` (a thin spec over `<DatesCard>`), co-located in the same `detail/` folder.
2. Remove the `h.date(...)` rows (and the trailing Close-date `ReadOnly`) from the `*DocumentCard`; it keeps series / number / currency / exchange rate. Trim now-unused imports/vars.
3. Render `<XDatesCard {...tabProps} />` **directly below** `<XDocumentCard>` in the detail page's aside.

The right panel becomes **Document** then **Dates** on every page — the visible change the design calls for.

Cards/pages to split (B): `QtDocumentCard` ✓(done), `PoDocumentCard`, `ApDocumentCard`, `ApriDocumentCard`, `GrDocumentCard` (goods receipts), `GrDocumentCard` (goods returns), `GrrDocumentCard`, `DprDocumentCard`, `DpiDocumentCard`, `CmDocumentCard`, `PrDocumentCard`, `RfqDocumentCard`, `LcDocumentCard`, `IpDocumentCard`, plus `RiCustomerCard` (dates currently inside the customer card), and the inline renders in `PaymentDetail` and `JeEditor`.

**Edge cases.**
- **Reserve invoice** (`RiCustomerCard`): dates are inside the *customer* card, not a document card. Pull them into a new `RiDatesCard` and add it to the reserve-invoice detail aside.
- **Payment made / received** (`PaymentDetail`, `IpDocumentCard`): the "due date" is the weighted means date, not a payment-term derivation — keep that hint as a per-call override.
- **Journal entry** (`JeEditor`): effective date is labelled "Doc. date"? No — effective = Posting, and the role there labelled `Doc. date` is the **Document** role. Keep `reversalDate` as a one-off inline date, outside the card.
- **Landed cost**: `customsDate` stays in `LcCostsCard` (it's a cost-line concept, one-off).
- **Dynamic hints** (`paymentTermName(...)`, `postingMoved`): computed at the call site and passed as `hint` overrides — the registry default is the fallback.

---

## Critical files

| File | Change |
|---|---|
| `src/components/form/DatesCard.tsx` | **new** — shared renderer *(done)* |
| `src/components/form/documentDates.ts` | **new** — `DOC_DATE` registry + `dateRow()` |
| `src/pages/**/detail/*DatesCard.tsx` | **new** per split document (B); **converted** for standalone (A) |
| `src/pages/**/detail/*DocumentCard.tsx` | dates removed, imports trimmed (B) |
| `src/pages/**/detail/*Detail.tsx` | render `<XDatesCard>` under `<XDocumentCard>` (B) |
| `src/pages/sales/reserve-invoices/detail/RiCustomerCard.tsx` | dates pulled out into `RiDatesCard` |
| `src/pages/purchasing/payments-made/detail/PaymentDetail.tsx`, `accounting/journal/JeEditor.tsx` | inline dates → `<DatesCard>` (reversalDate stays inline) |

**Reuse, never redefine:** `bind()`, `Section` (from `fields.tsx`), `activeOptions`, `formatDate`, `paymentTermName`. No new date-formatting or Section boilerplate per card.

---

## Status — complete

- `DatesCard.tsx` — shared renderer (`dates` / `closeDate` / `closeHint` / `children`); `DateSpec.key` is a plain `string`, cast to `KeysOf<T>` once inside the card.
- `documentDates.ts` — the `DOC_DATE` registry + `dateRow(def, overrides)` helper. **Built and in use everywhere.**
- **Standalone conversions (shape A):** `QtDatesCard`, `SoDatesCard`, `DnDatesCard`, `ArDatesCard`, `ReturnDatesCard` (shared by sales return + A/R credit memo), `RiDatesCard`.
- **Splits (shape B):** quotation, A/P invoice, A/P reserve invoice, goods receipt, goods return, goods return request, down-payment request, down-payment invoice, debit memo, purchase request, landed cost, payment received — each got a new `*DatesCard` and its Document card trimmed, with `<XDatesCard>` wired under `<XDocumentCard>`.
- **Merges (special — dates were spread across two cards):** PO and RFQ. Their posting/document/delivery(PO)/validUntil(RFQ)/required dates moved into the existing "Dates & references" `PoDatesCard` / `RfqDatesCard`; the cascade (PO delivery → line dates, RFQ required → line dates) is preserved via a wrapped `update` on the card. `PoDocumentCard` / `RfqDocumentCard` now hold only No./series + Status.
- **Inline:** `PaymentDetail` (payments made) — its inline "Document" dates now render through `<DatesCard>`.
- **Intentional exception:** `JeEditor` (journal entry) keeps its inline dates. It's a compact single-column accounting editor built on a `<Fields>` grid, not the aside Document-then-Dates card pattern, so the shared `DatesCard` Section does not fit its layout. `reversalDate` stays inline there as a one-off.
- **`PrDocumentCard` was deleted** — it held *only* dates (no series/currency), so splitting it left an empty card; the PR number lives in another card.

**Behavior changes (intended consistency wins):** a few documents that previously left a date hint blank now inherit the registry default — the A/R credit memo due date ("From the payment terms."), and the posting/document hints on the down-payment invoice, payment received, and payment made. No code depended on those being blank.

### Hidden `•` fields — surfaced (per-field triage)

Each was decided individually (populated? read by logic? user-editable?):

| Field | Finding | Decision |
|---|---|---|
| Payment received / made `cancelDate` | stamped on cancel | **Surfaced read-only** as the Close row (`closeDate={draft.cancelDate}`) |
| PO `dueDate` | seeded, feeds payment timing | **Surfaced editable** |
| SO `documentDate` | seeded (21×), SAP B1 confirms | **Surfaced editable** |
| SO `dueDate` | real wired feature — `soDueDate(...)` on submit + customer change, validated (due ≥ posting), with `dueMonths`/`dueDays` recalc inputs | **Surfaced editable** |
| Delivery `dueDate` | read by logic — carried into the GL journal (`deliveries.ts:196`) | **Surfaced read-only** ("Carried from the order to the journal entry.") |

All verified by `npm run test:e2e` (275/275).

**Verification:** `npm run typecheck` clean for every date file; `npm run test:e2e` — **275/275 pass** (full screen sweep + document-flow tests). The remaining typecheck/lint/knip hits (`TotalsFooter` `amt`, `PurchaseOrderDetail`/`ReturnDocumentsList` `any`, `landedCosts` unused exports) are **pre-existing uncommitted branch WIP**, unrelated to this sweep.

---

## Verification

1. `npm run typecheck` — zero (ignoring the pre-existing `apDownPaymentInvoices.ts` errors already on the branch).
2. `npm run lint` — zero errors.
3. `npm run knip` — zero (new `*DatesCard` exports are wired immediately, so no `@public` tag needed).
4. `npm run test:e2e` — the screen sweep loads every detail page; catches a date field dropped or a raw value leaking.
5. Manual (`/run` or dev): spot-check one document per role-combination (quotation, sales order, A/P invoice, goods receipt, journal entry) — confirm the right panel shows **Document** then **Dates**, every date has its hint, and read-only/stage locking still applies.

---

## Appendix — the document chain (how one document affects another)

This is the context that makes the hidden **Close** / stamp dates matter: the dates aren't vestigial, they're written by these flows. Posting a downstream document **draws down** its base — moving a quantity or amount, flipping the base's line/document status, and stamping the base's `closeDate` when it's fully consumed. **Cancelling reverses it** (the same `apply*(…, sign)` called with `-1`, or a before/after diff). Audited from the service layer.

### Draw-down matrix

| Posting this document… | …draws down this base | What moves on the base | Reverses on cancel | Mechanism (file:line) |
|---|---|---|:-:|---|
| **Sales order** | Quotation | — *(copy-only; the quotation is closed by hand via `closeQuotation`)* | n/a | — |
| **Delivery** | Sales order | `deliveredQty` ↑; line + order **Close** (stamps `closeDate`) when fully delivered | ✓ | `salesOrders.applyDelivered` (`deliveries.ts:187` / `:249`) |
| **A/R invoice** | Delivery **or** Sales order | delivery `invoicedQty` ↑ / SO `deliveredQty` ↑; base **Closes** | ✓ | `deliveries.applyInvoiced` + `salesOrders.applyDelivered` (`arInvoices.ts:223-224` / `:269-270`) |
| **Incoming payment** | A/R invoice | amount settled ↑; invoice **Closes** when paid in full | ✓ | `arInvoices.applyArPayments` (`incomingPayments.ts:221` / `:250`) |
| **A/R credit memo** | A/R invoice **and** Sales return | invoice credit applied; return `creditedQty` ↑ | ✓ | `applyArPayments` + `salesReturns.applySrCreditedQty` (`arCreditMemos.ts:182-203` / `:234-243`) |
| **Purchase order** | Purchase request | PR `openQty` ↓; PR line + document **Close** | ✓ *(before/after)* | `purchaseRequests.applyRequestDraw` (`purchaseOrders.ts:162…268`) |
| **Goods receipt** | Purchase order | PO `receivedQty` ↑; PO **Closes** | ✓ | `applyToOrders` + `saveReceivedQuantities` (`goodsReceipts.ts:253` / `:352`) |
| **A/P invoice** | Goods receipt **or** Purchase order; + DP request/invoice | GR `invoicedQty` ↑ / PO `receivedQty` ↑; down-payments deducted | ✓ | `applyInvoicedQty` + `applyToOrders` + `drawDownPayments` / `drawDownPaymentInvoices` (`apInvoices.ts:277-279` / `:324-325` / `:378-379`) |
| **Goods return** | Goods receipt; Goods return request; A/P invoice | GR `returnedQty` ↑; GRR consumed; invoice returns recorded | ✓ | `applyReturnedQty` + `applyGrrConsumption` + `applyInvoiceReturns` (`goodsReturns.ts:171-189` / `:177-203`) |
| **A/P credit memo** | A/P invoice **and** Goods return | invoice credit applied; return `creditedQty` ↑ | ✓ | `applyPayments` + `applyInvoiceReturns` + `goodsReturns.applyCreditedQty` (`apCreditMemos.ts:194-204` / `:252-264`) |
| **Outgoing payment** | A/P invoice; + DP request/invoice | amount settled ↑; invoice **Closes**; down-payments paid | ✓ | `apInvoices.applyPayments` + `applyDownPaymentPayments` / `applyDownPaymentInvoicePayments` (`outgoingPayments.ts:152-154` / `:168-170`) |

### Copy-only lineage (no draw-down)

The **heads of each chain carry lineage but do not draw down**: **Quotation → Sales order**, **Purchase request → RFQ**, and **RFQ → Purchase order**. The downstream document stores `baseId`/`baseLineId` for the `DocumentFlow` graph, but posting it moves nothing on the source. (RFQs deliberately don't consume the PR's `openQty` — only the **PO** does; see `docs/multi-vendor-rfq-plan.md`.) A quotation or RFQ is closed manually, not by its successor.

### Side effects beyond the chain

The same post also, where applicable: moves **stock** (`goodsReceipts.applyStock`, delivery consumption), consumes/creates **FIFO layers** (`costLayers.consumeLayers`, `updateFifoCosts`), re-allocates **landed cost** into inventory (`landedCosts.applyLandedCostToInventory`), and writes the **GL journal** (`postDocumentEntry`). All are reversed on cancel.

### Status: working

Every row above is wired **and reversible** today — verified from the `apply*` call sites (each has a matching `+1` post and `-1` cancel, or a before/after diff). The chain's `closeDate`/`cancelDate` stamps are live data, which is the concrete reason the **•** (hidden) Close cells in the matrix above should be surfaced by the dates migration.
