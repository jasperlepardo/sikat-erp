# A/R customer down-payment invoice (IFRS 15 contract liability)

> **Status: designed + accounting validated; not yet built.** The journal design below was proven in a
> throwaway harness — a down payment invoice posts `Dr A/R 1120 / Cr Output VAT 2310 / Cr Customer
> Down Payments 2150` (no revenue, entry balances) and the draw/close cycle ties out. The full
> subsystem (new document type + list/detail UI, routing, nav, the A/R-invoice draw-down, and payment
> integration) is a sizable build and has **not** been committed — it should be done as a focused
> effort rather than left half-wired. This doc is the ready-to-build spec.

## Context

The audit (`docs/line-rollup-tabs-plan.md` sibling work) found the A/P side has a full down-payment
flow — request (DPR, posts nothing) and invoice (DPI, `Dr Advances to Suppliers 1150 / Cr Vendor`) —
but the **A/R side has no down-payment document**. Account **`2150` "Customer Down Payments"** exists
in the chart of accounts but is unused; customer advances are only handled as on-account A/R credits.

Under IFRS 15, cash billed/received before the performance obligation is satisfied is a **contract
liability**, not revenue. So a customer down payment should credit `2150`, and the final A/R invoice
should draw it down — the mirror of the A/P side.

## Scope

**This build: the A/R Down Payment Invoice (DI)** — the accounting-complete, usable core:

- New document `DownPaymentInvoice` (A/R), mirroring `apDownPaymentInvoices`.
- `diJournal`: `Dr A/R (1120) + ... / Cr Customer Down Payments (2150) + Cr Output VAT`. (VAT is a
  tax-point event at invoice, so it posts; **no revenue** — that waits for the real A/R invoice.)
- Customer pays it via an **incoming payment** (`Dr Cash / Cr A/R`) — reuses the existing payment flow.
- The final **A/R invoice draws it down**: `Dr 2150 / Cr A/R` (clearing the advance against the sale),
  mirroring `apInvoices` `drawnDownPayments`.
- Created from a sales order ("Create A/R down payment invoice") or standalone.
- List + detail pages, route, paths, nav entry.

**Deferred (optional fast-follow):** the A/R Down Payment *Request* (non-posting convenience doc,
mirror of DPR). Not required for the accounting to be correct — the invoice is the posting document.

## Accounting

| Event | Journal |
|---|---|
| Down payment invoice issued | `Dr A/R 1120 / Cr Customer Down Payments 2150 + Cr Output VAT 2310` |
| Customer pays it (incoming payment) | `Dr Cash / Cr A/R 1120` (existing flow) |
| Final A/R invoice draws it down | its normal entry **plus** `Dr Customer Down Payments 2150 / Cr A/R 1120` (and credits back the output VAT the DI already took, so the final invoice charges VAT only on the remainder) |

Net across the three: revenue recognized once (final invoice), VAT once, `2150` nets to zero, A/R
reflects only the uncovered balance. No double counting.

## Build phases

1. **Mock** — `src/mocks/arDownPaymentInvoices.ts`: `DownPaymentInvoice`, `DiLine`, `blankDownPaymentInvoice`,
   `newDiLine`, `DI_SERIES`, `CUSTOMER_DOWN_PAYMENTS = '2150'`, empty seed. Register `DI_SERIES` in
   `allSeries`. Extend `ArInvoice` with `drawnDownPayments?` + `downPayment` (reuse the `DownPaymentDraw`
   shape). Bump `SEED_VERSION`.
2. **Service** — `src/services/arDownPaymentInvoices.ts`: list/get/save/add, `diJournal`, `diNumber`,
   `diTotals`, `diDrawable`, `applyDiPayments` (from incoming payment), `drawDownPaymentInvoices` (from
   A/R invoice), close/cancel/recall. Extend `arInvoices` service: credit `2150` for draws + draw
   validation + call `drawDownPaymentInvoices`. Extend `incomingPayments` to settle DI rows.
3. **UI** — paths, router, nav, list page, detail page (+ cards/types), SO "Create A/R down payment
   invoice" menu, A/R invoice DrawPanel (mirror `vendor-invoices/detail/DrawPanel.tsx`).
4. **Verify** — `check-seeds` (add a `2150` invariant), a harness driver (mirror
   `reserve-fulfilment-check.ts`) that posts a DI, pays it, draws it on an A/R invoice and asserts the
   journals + `2150` nets to zero; `typecheck`/`lint`/`knip`/`e2e`.
