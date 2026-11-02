import { DOC_DATE, dateRow } from '../components/form/documentDates';
import { type DatesDef, type DateSpec } from '../components/form/DatesCard';
import { todayISO } from '../services/dates';
import { paymentTermName } from '../services/purchaseOrders';
import type { IncomingInput } from '../services/incomingPayments';
import type { PbaDraft } from './purchasing/purchase-agreements/detail/types';
import type { BaDraft } from './sales/agreements/detail/types';
import type { Draft as QtDraft, QtContext } from './sales/quotations/detail/types';
import type { SoTabProps } from './sales/sales-orders/detail/types';
import type { DnSectionProps } from './sales/deliveries/detail/types';
import type { ArSectionProps } from './sales/invoices/detail/types';
import type { RiSectionProps } from './sales/reserve-invoices/detail/types';
import type { DiSectionProps } from './sales/down-payment-invoices/detail/types';
import type { PrSectionProps } from './purchasing/purchase-requests/detail/types';
import type { GrSectionProps as GrReceiptProps } from './purchasing/goods-receipts/detail/types';
import type { GrSectionProps as GrReturnProps } from './purchasing/goods-returns/detail/types';
import type { GrrSectionProps } from './purchasing/goods-return-requests/detail/types';
import type { ApSectionProps } from './purchasing/vendor-invoices/detail/types';
import type { ApriSectionProps } from './purchasing/reserve-invoices/detail/types';
import type { DprSectionProps } from './purchasing/down-payment-requests/detail/types';
import type { DpiSectionProps } from './purchasing/down-payment-invoices/detail/types';
import type { CmSectionProps } from './purchasing/debit-memos/detail/types';
import type { LcSectionProps } from './purchasing/landed-costs/detail/types';
import type { PoTabProps } from './purchasing/purchase-orders/detail/types';
import type { RfqTabProps } from './purchasing/purchase-quotations/detail/types';

/**
 * Central registry of every document's Dates card — the single source of truth for which date roles
 * each document carries and how (one typed entry per document, consumed by `<DocumentDates>`). Dates
 * only; reference fields and other cards stay with their pages. See `docs/document-dates-plan.md`.
 *
 * Two documents are not here, by design: the sales return / A/R credit memo share one `ReturnDatesCard`
 * (per-page hints), and payment-made renders `<DatesCard>` inline (its posting hint needs the live
 * currency + rate). Both are documented in the plan.
 */

// ── Sales ──────────────────────────────────────────────────────────────────

export const quotationDates: DatesDef<QtDraft, { ctx: QtContext }> = {
  closeField: 'closeDate',
  closeHint: 'Set when the quotation is closed or cancelled.',
  rows: ({ draft, errors, ctx }) => {
    const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;
    return [
      dateRow(DOC_DATE.effective, {
        label: 'Quotation date',
        error: errors.postingDate,
        readOnly: ctx.added,
        hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : 'Sets the exchange rate, tax rates and which prices apply.',
      }),
      dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: 'The date for records. Defaults to today.' }),
      dateRow(DOC_DATE.validUntil, { readOnly: ctx.readOnly, hint: 'After this date the quotation is expired.', optional: true }),
    ];
  },
};

export const salesOrderDates: DatesDef<SoTabProps['draft'], { ctx: SoTabProps['ctx'] }> = {
  rows: ({ draft: _draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.added, hint: 'Sets the exchange rate, tax rates and which prices apply.' }),
    dateRow(DOC_DATE.due, { error: errors.dueDate, readOnly: ctx.readOnly, hint: 'Posting date + the payment terms. Change it to override.', optional: true }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: 'The date for records. Defaults to today.' }),
    dateRow(DOC_DATE.delivery, { error: errors.deliveryDate, readOnly: ctx.readOnly, hint: 'When the customer expects delivery.', optional: true }),
    dateRow(DOC_DATE.required, { error: errors.requiredDate, readOnly: ctx.readOnly, hint: 'When the customer needs it — for planning.', optional: true }),
    dateRow(DOC_DATE.cancellation, { error: errors.cancellationDate, readOnly: ctx.readOnly, hint: "After this date the order is cancelled and you're no longer committed.", optional: true }),
  ],
};

export const deliveryDates: DatesDef<DnSectionProps['draft'], { ctx: DnSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  rows: ({ errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.added, hint: 'When the stock goes out and the cost is posted.' }),
    dateRow(DOC_DATE.due, { readOnly: true, hint: 'Carried from the order to the journal entry.' }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.added, hint: 'The date on the delivery receipt. Defaults to today.' }),
    dateRow(DOC_DATE.delivery, { readOnly: ctx.readOnly, hint: 'When it reaches the customer.' }),
  ],
};

export const arInvoiceDates: DatesDef<ArSectionProps['draft'], { ctx: ArSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  rows: ({ draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly, hint: 'When revenue, VAT and any stock it ships are posted.' }),
    dateRow(DOC_DATE.due, { required: true, error: errors.dueDate, readOnly: ctx.readOnly, hint: `From the payment terms (${paymentTermName(draft.paymentTermId)}).` }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly }),
  ],
};

export const arReserveInvoiceDates: DatesDef<RiSectionProps['draft'], { ctx: RiSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  rows: ({ draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly, hint: 'When A/R, revenue, and VAT are posted (no stock movement).' }),
    dateRow(DOC_DATE.due, { required: true, error: errors.dueDate, readOnly: ctx.readOnly, hint: `From the payment terms (${paymentTermName(draft.paymentTermId)}).` }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly }),
  ],
};

export const arDownPaymentInvoiceDates: DatesDef<DiSectionProps['draft'], { ctx: DiSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  rows: ({ draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, readOnly: ctx.readOnly, hint: 'Sets the period, tax rates and the exchange rate the advance is booked at.' }),
    dateRow(DOC_DATE.due, { error: errors.dueDate, readOnly: ctx.readOnly, hint: `When the advance is due (${paymentTermName(draft.paymentTermId)}).`, optional: true }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: 'The date for records. Defaults to today.' }),
  ],
};

export const paymentReceivedDates: DatesDef<IncomingInput, { readOnly: boolean }> = {
  closeField: 'cancelDate',
  closeHint: 'Set when the payment is cancelled.',
  rows: ({ errors, readOnly }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, readOnly, hint: 'The day the payment is booked.' }),
    dateRow(DOC_DATE.due, { readOnly, hint: "The BP row's due date; follows the payment means (weighted average).", optional: true }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly, hint: "The payment's reference date. Defaults to today." }),
  ],
};

// ── Purchasing ─────────────────────────────────────────────────────────────

export const purchaseRequestDates: DatesDef<PrSectionProps['draft']> = {
  closeField: 'closeDate',
  closeHint: 'Set when the request is closed.',
  rows: ({ errors }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, hint: 'When the request is raised. Defaults to today.' }),
    dateRow(DOC_DATE.document, { required: true, error: errors.documentDate, hint: 'The date for records. Defaults to today.' }),
    dateRow(DOC_DATE.required, { hint: 'When the items or services are needed. Cascades to new lines.', optional: true }),
    dateRow(DOC_DATE.validUntil, { hint: 'Date the request lapses if unfulfilled.', optional: true }),
  ],
};

export const goodsReceiptDates: DatesDef<GrReceiptProps['draft'], { ctx: GrReceiptProps['ctx'] }> = {
  closeField: 'closeDate',
  closeHint: 'Set when the receipt is closed or cancelled.',
  rows: ({ errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly, hint: 'When the stock is recorded. Sets the exchange rate, tax rates and period.' }),
    dateRow(DOC_DATE.due, { error: errors.dueDate, readOnly: ctx.readOnly, hint: 'Posting date + the payment terms. The A/P invoice takes it.', optional: true }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: "The date on the vendor's delivery receipt. Defaults to today." }),
  ],
};

export const goodsReturnDates: DatesDef<GrReturnProps['draft']> = {
  closeField: 'closeDate',
  rows: ({ errors }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, hint: 'When the stock leaves.' }),
    dateRow(DOC_DATE.due, { hint: "When the vendor's credit is due, from the payment terms.", optional: true }),
    dateRow(DOC_DATE.document, { required: true, error: errors.documentDate, hint: 'The date on the return document. Defaults to today.' }),
  ],
};

export const goodsReturnRequestDates: DatesDef<GrrSectionProps['draft']> = {
  closeField: 'closeDate',
  rows: ({ errors }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, hint: 'When the request is raised. Defaults to today.' }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, hint: 'The date for records. Defaults to today.' }),
    dateRow(DOC_DATE.required, { hint: 'When the goods should be ready to send back.', optional: true }),
  ],
};

export const apInvoiceDates: DatesDef<ApSectionProps['draft'], { ctx: ApSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  closeHint: 'Set when the invoice is paid in full or cancelled.',
  rows: ({ draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly, hint: 'Sets the period, tax rates and the exchange rate the bill is booked at.' }),
    dateRow(DOC_DATE.due, { required: true, error: errors.dueDate, readOnly: ctx.readOnly, hint: `Posting date + the payment terms${draft.paymentTermId ? ` (${paymentTermName(draft.paymentTermId)})` : ''}. Change it to override.` }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: "The date on the vendor's invoice — the date BIR uses for input VAT." }),
  ],
};

export const apReserveInvoiceDates: DatesDef<ApriSectionProps['draft'], { ctx: ApriSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  closeHint: 'Set when the invoice is fully received or cancelled.',
  rows: ({ draft, errors, ctx }) => [
    dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.readOnly, hint: 'Sets the period, tax rates and the exchange rate the bill is booked at.' }),
    dateRow(DOC_DATE.due, { required: true, error: errors.dueDate, readOnly: ctx.readOnly, hint: `Posting date + the payment terms${draft.paymentTermId ? ` (${paymentTermName(draft.paymentTermId)})` : ''}. Change it to override.` }),
    dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: "The date on the vendor's invoice." }),
  ],
};

export const downPaymentRequestDates: DatesDef<DprSectionProps['draft'], { ctx: DprSectionProps['ctx'] }> = {
  closeField: 'closeDate',
  rows: ({ errors, ctx }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, readOnly: ctx.readOnly, hint: 'When the advance is requested. Defaults to today.' }),
    dateRow(DOC_DATE.due, { hint: 'When the vendor wants the advance, from the payment terms.', readOnly: ctx.readOnly, optional: true }),
    dateRow(DOC_DATE.document, { required: true, error: errors.documentDate, readOnly: ctx.readOnly, hint: 'The date for records. Defaults to today.' }),
  ],
};

export const downPaymentInvoiceDates: DatesDef<DpiSectionProps['draft']> = {
  closeField: 'closeDate',
  rows: ({ errors }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, hint: 'Sets the period, tax rates and the exchange rate the advance is booked at.' }),
    dateRow(DOC_DATE.due, { required: true, error: errors.dueDate }),
    dateRow(DOC_DATE.document, { error: errors.documentDate }),
  ],
};

export const debitMemoDates: DatesDef<CmSectionProps['draft']> = {
  closeField: 'closeDate',
  rows: ({ errors }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, hint: 'Sets the period, tax rates and the exchange rate the credit is booked at.' }),
    dateRow(DOC_DATE.due, { hint: 'When the credit is due, from the payment terms.', optional: true }),
    dateRow(DOC_DATE.document, { required: true, error: errors.documentDate, hint: "The date on the vendor's credit note." }),
  ],
};

export const landedCostDates: DatesDef<LcSectionProps['draft'], { readOnly: boolean }> = {
  rows: ({ errors, readOnly }) => [
    dateRow(DOC_DATE.effective, { required: true, error: errors.postingDate, readOnly, hint: 'When the landed costs are capitalized into inventory. Sets the period and exchange rate.' }),
    dateRow(DOC_DATE.due, { readOnly, hint: 'When the cost invoice is due, from the payment terms.' }),
  ],
};

export const purchaseOrderDates: DatesDef<PoTabProps['draft'], { ctx: PoTabProps['ctx'] }> = {
  closeField: 'closeDate',
  closeHint: 'Set when the PO is closed or cancelled.',
  // The header delivery date also moves line dates that still match the old one.
  cascade: (draft, patch) =>
    'deliveryDate' in patch
      ? { ...patch, lines: draft.lines.map((l) => (!l.deliveryDate || l.deliveryDate === draft.deliveryDate ? { ...l, deliveryDate: patch.deliveryDate ?? '' } : l)) }
      : patch,
  rows: ({ draft, errors, ctx }) => {
    const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;
    return [
      dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.added, hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : 'Defaults to today. Sets the exchange rate and tax rates used.' }),
      dateRow(DOC_DATE.due, { error: errors.dueDate, readOnly: ctx.readOnly, hint: 'When payment is due. The goods receipt and A/P invoice take it.', optional: true }),
      dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly: ctx.readOnly, hint: 'The date for records. Defaults to today.' }),
      dateRow(DOC_DATE.delivery, { required: true, error: errors.deliveryDate, readOnly: ctx.readOnly, hint: 'When the items should arrive. Lines take it unless they have their own.' }),
      dateRow(DOC_DATE.required, { error: errors.requiredDate, readOnly: ctx.readOnly, hint: 'When the goods must leave the vendor to arrive by the delivery date.', optional: true }),
      dateRow(DOC_DATE.cancellation, { error: errors.cancellationDate, readOnly: ctx.readOnly, hint: "After this date the PO is cancelled and you're no longer committed.", optional: true }),
    ];
  },
};

export const rfqDates: DatesDef<RfqTabProps['draft'], { ctx: RfqTabProps['ctx'] }> = {
  // The header required date also moves line dates that still match the old one.
  cascade: (draft, patch) =>
    'requiredDate' in patch
      ? { ...patch, lines: draft.lines.map((l) => (!l.requiredDate || l.requiredDate === draft.requiredDate ? { ...l, requiredDate: patch.requiredDate ?? '' } : l)) }
      : patch,
  rows: ({ draft, errors, ctx }) => {
    const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;
    return [
      dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly: ctx.added, hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : 'When the RFQ is issued. Defaults to today.' }),
      dateRow(DOC_DATE.document, { error: errors.documentDate, hint: 'The date for records. Defaults to today.' }),
      dateRow(DOC_DATE.required, { hint: 'When the items are needed. Cascades to new lines.', optional: true }),
      dateRow(DOC_DATE.validUntil, { hint: 'Expiry date for the quoted prices.', optional: true }),
    ];
  },
};

// ── Blanket agreements ───────────────────────────────────────────────────────
// These dates (start / end / signing / termination) are agreement-specific — not the shared
// `DOC_DATE` roles — so the rows are spelled out directly rather than via `dateRow`.

const agreementDateRows = (readOnly: boolean): DateSpec[] => [
  { key: 'startDate', label: 'Start date', required: true, readOnly },
  { key: 'endDate', label: 'End date', readOnly },
  { key: 'signingDate', label: 'Signing date', required: true, readOnly },
  { key: 'terminationDate', label: 'Termination date', readOnly: true, hint: 'Set automatically when the agreement is terminated.' },
];

export const purchaseAgreementDates: DatesDef<PbaDraft, { readOnly: boolean }> = {
  rows: ({ readOnly }) => agreementDateRows(readOnly),
};

export const salesAgreementDates: DatesDef<BaDraft, { readOnly: boolean }> = {
  rows: ({ readOnly }) => agreementDateRows(readOnly),
};
