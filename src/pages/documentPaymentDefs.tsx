/**
 * Central registry of each document's payment cards (Payment + Journal entry), one `PaymentDef` per
 * document — the payment-side counterpart to `documentDateDefs.tsx`. Rendered through
 * `DocumentPayment` from `src/components/form/PaymentCard.tsx`.
 */
import { Combobox } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, type Errors } from '../components/form/fields';
import type { Partner } from '../mocks/partners';
import type { Account } from '../mocks/chartOfAccounts';
import type { PaymentDef } from '../components/form/PaymentCard';
import type { PoTabProps } from './purchasing/purchase-orders/detail/types';
import type { RfqTabProps } from './purchasing/purchase-quotations/detail/types';
import type { DprSectionProps } from './purchasing/down-payment-requests/detail/types';
import type { DpiSectionProps } from './purchasing/down-payment-invoices/detail/types';
import type { ApSectionProps } from './purchasing/vendor-invoices/detail/types';
import type { GrSectionProps } from './purchasing/goods-receipts/detail/types';
import type { ApriSectionProps } from './purchasing/reserve-invoices/detail/types';
import type { GrSectionProps as GrrSectionProps } from './purchasing/goods-returns/detail/types';
import type { CmSectionProps } from './purchasing/debit-memos/detail/types';
import type { QtTabProps } from './sales/quotations/detail/types';
import type { SoTabProps } from './sales/sales-orders/detail/types';
import type { ArSectionProps } from './sales/invoices/detail/types';
import type { RiSectionProps } from './sales/reserve-invoices/detail/types';
import type { DnSectionProps } from './sales/deliveries/detail/types';
import type { ArCmSectionProps, SrSectionProps } from './sales/returns-and-credits/types';

/** The "Consolidating BP" combobox — pay/settle this document through another partner. */
function consolidatingBp(vendors: Partner[], vendorId: string, value: string, onChange: (id: string) => void, tooltip?: string) {
  return (
    <CtxFormField label="Consolidating BP" tooltip={tooltip}>
      {(p) => (
        <Combobox
          {...p}
          placeholder="None"
          options={vendors
            .filter((v) => v.id !== vendorId && (v.status !== 'Inactive' || v.id === value))
            .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
          value={value || null}
          onValueChange={(id) => onChange(id ?? '')}
        />
      )}
    </CtxFormField>
  );
}

// ── Purchasing ───────────────────────────────────────────────────────────────

export const purchaseOrderPayment: PaymentDef<PoTabProps['draft'], { ctx: PoTabProps['ctx'] }> = {
  build: ({ ctx }) => ({
    paymentTerm: { readOnly: ctx.readOnly, hint: 'Defaults from the vendor; sets the due date.' },
    paymentMethod: { readOnly: ctx.readOnly, hint: 'Defaults from the vendor.' },
    cashDiscountDays: { readOnly: ctx.readOnly, hint: 'Days added to the posting date before the early-payment discount window starts.' },
    journalRemark: { readOnly: ctx.readOnly, hint: 'Defaults to "Purchase Orders – vendor code". With perpetual inventory, it\'s the journal entry\'s remark.' },
    // BP project lives in the References card (aside), not the journal entry.
  }),
};

// A purchase quotation is a solicitation — it never posts a journal, so it carries no accounting
// fields (the journal remark and BP project default onto the PO when the RFQ is converted).
export const rfqPayment: PaymentDef<RfqTabProps['draft'], { ctx: RfqTabProps['ctx'] }> = {
  build: () => ({
    paymentTerm: { hint: 'Defaults from the vendor.' },
    paymentMethod: { hint: 'Defaults from the vendor.' },
    cashDiscountDays: { hint: 'Days added to the posting date before the early-payment discount window starts.' },
  }),
};

export const downPaymentRequestPayment: PaymentDef<DprSectionProps['draft'], { ctx: DprSectionProps['ctx']; m: DprSectionProps['m'] }> = {
  build: ({ draft, errors, ctx, m }) => ({
    paymentTerm: { hint: 'Sets the due date.' },
    paymentMethod: {},
    cashDiscountDays: {},
    installmentsRead: { label: 'Installments', value: String(draft.installments) },
    flags: [{ key: 'paymentBlock', label: 'Payment block' }],
    journalRemark: { hint: 'Used on the payment that pays it.' },
    account: {
      role: 'downPaymentClearing',
      key: 'downPaymentAccount',
      label: 'Down payment account',
      accounts: m.accounts,
      required: true,
      readOnly: ctx.readOnly,
      error: errors.downPaymentAccount,
      hint: "Where the advance sits once paid: the vendor's down payment account, else Advances to Suppliers.",
    },
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

export const downPaymentInvoicePayment: PaymentDef<DpiSectionProps['draft'], { ctx: DpiSectionProps['ctx']; m: DpiSectionProps['m'] }> = {
  build: ({ draft, errors, ctx, m }) => ({
    journalRemark: { readOnly: ctx.readOnly },
    account: {
      role: 'downPaymentClearing',
      key: 'downPaymentAccount',
      label: 'Down payment account',
      accounts: m.accounts,
      required: true,
      readOnly: ctx.readOnly,
      error: errors.downPaymentAccount,
      hint: 'Where the advance sits once paid.',
    },
    reads: [{ label: 'Order No.', value: draft.orderNumber ?? '—' }],
  }),
};

export const apInvoicePayment: PaymentDef<ApSectionProps['draft'], { ctx: ApSectionProps['ctx']; m: ApSectionProps['m'] }> = {
  build: ({ draft, update, errors, ctx, m }) => ({
    paymentTerm: { hint: 'Defaults from the vendor or the base document; sets the due date.' },
    paymentMethod: { hint: 'Defaults from the vendor.' },
    cashDiscountDays: { hint: 'Days added to the posting date before the early-payment discount window starts.' },
    installmentsRead: { label: 'Installments', value: String(draft.installments), hint: 'Split into installments once payments are built.' },
    flags: [{ key: 'maxCashDiscount', label: 'Max. cash discount (take the largest early-payment discount the terms allow)' }],
    journalRemark: { hint: 'Defaults to "A/P Invoices – vendor code". It\'s the remark on the journal entry.' },
    account: {
      role: 'payable',
      key: 'controlAccount',
      label: 'Control account',
      accounts: m.accounts,
      required: true,
      readOnly: ctx.readOnly,
      error: errors.controlAccount,
      hint: "The vendor's payable account. Change it to post this invoice to another one, e.g. A/P – Import.",
    },
    nodes: [consolidatingBp(m.vendors, draft.vendorId, draft.consolidatingBpId, (id) => update({ consolidatingBpId: id }), "Pay this invoice through another partner, e.g. the vendor's parent company.")],
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

export const goodsReceiptPayment: PaymentDef<GrSectionProps['draft'], { ctx: GrSectionProps['ctx'] }> = {
  build: () => ({
    paymentTerm: { hint: 'Defaults from the vendor or the PO; sets the due date.' },
    paymentMethod: { hint: 'Defaults from the vendor.' },
    cashDiscountDays: { hint: 'Days added to the posting date before the early-payment discount window starts.' },
    journalRemark: { hint: 'Defaults to "Goods Receipt PO – vendor code". It\'s the remark on the journal entry.' },
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

export const apReserveInvoicePayment: PaymentDef<ApriSectionProps['draft'], { ctx: ApriSectionProps['ctx']; m: ApriSectionProps['m'] }> = {
  build: ({ draft, update, errors, ctx, m }) => ({
    paymentTerm: { hint: 'Defaults from the vendor or the base PO; sets the due date.' },
    paymentMethod: { hint: 'Defaults from the vendor.' },
    cashDiscountDays: { hint: 'Days added to the posting date before the early-payment discount window starts.' },
    installmentsRead: { label: 'Installments', value: String(draft.installments), hint: 'Split into installments once payments are built.' },
    flags: [{ key: 'maxCashDiscount', label: 'Max. cash discount (take the largest early-payment discount the terms allow)' }],
    journalRemark: { hint: 'Appears on the journal entry when this invoice is posted.' },
    account: {
      role: 'payable',
      key: 'controlAccount',
      label: 'Control account',
      accounts: m.accounts,
      required: true,
      readOnly: ctx.readOnly,
      error: errors.controlAccount,
      hint: "The vendor's payable account. Change it to post to a different one.",
    },
    nodes: [consolidatingBp(m.vendors, draft.vendorId, draft.consolidatingBpId, (id) => update({ consolidatingBpId: id }), "Pay this invoice through another partner, e.g. the vendor's parent company.")],
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

export const goodsReturnPayment: PaymentDef<GrrSectionProps['draft'], { ctx: GrrSectionProps['ctx']; m: GrrSectionProps['m'] }> = {
  build: ({ draft, update, m }) => ({
    paymentTerm: { hint: 'Defaults from the vendor or the base document.' },
    paymentMethod: {},
    cashDiscountDays: {},
    journalRemark: { hint: 'Defaults to "Goods Returns – vendor code".' },
    nodes: [consolidatingBp(m.vendors, draft.vendorId, draft.consolidatingBpId, (id) => update({ consolidatingBpId: id }), "Settle this return's credit through another partner.")],
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

export const debitMemoPayment: PaymentDef<CmSectionProps['draft'], { ctx: CmSectionProps['ctx']; m: CmSectionProps['m'] }> = {
  build: ({ draft, update, errors, m }) => ({
    paymentTerm: {},
    paymentMethod: {},
    cashDiscountDays: {},
    installmentsRead: { label: 'Installments', value: String(draft.installments) },
    flags: [{ key: 'maxCashDiscount', label: 'Max. cash discount' }],
    journalRemark: { hint: 'Defaults to "A/P Credit Memo – vendor code".' },
    account: {
      role: 'payable',
      key: 'controlAccount',
      label: 'Control account',
      accounts: m.accounts,
      required: true,
      readOnly: draft.status !== 'Draft',
      error: errors.controlAccount,
      hint: "The vendor's payable account by default.",
    },
    nodes: [consolidatingBp(m.vendors, draft.vendorId, draft.consolidatingBpId, (id) => update({ consolidatingBpId: id }))],
    // BP project, indicator, federal tax ID and order number live in the References card (aside).
  }),
};

// ── Sales ────────────────────────────────────────────────────────────────────

// A sales quotation is a solicitation — it never posts a journal, so it carries no accounting fields
// (the journal remark and BP project default onto the sales order when the quotation is converted).
export const quotationPayment: PaymentDef<QtTabProps['draft'], { ctx: QtTabProps['ctx'] }> = {
  build: ({ ctx }) => ({
    paymentTerm: { readOnly: ctx.readOnly, hint: 'Defaults from the customer.' },
    paymentMethod: { readOnly: ctx.readOnly, hint: 'Defaults from the customer.' },
    cashDiscountDays: { readOnly: ctx.readOnly, hint: 'Days added to the quotation date before the early-payment discount window starts.' },
  }),
};

export const salesOrderPayment: PaymentDef<SoTabProps['draft'], { ctx: SoTabProps['ctx'] }> = {
  build: ({ ctx }) => ({
    paymentTerm: { readOnly: ctx.readOnly, hint: 'Defaults from the customer; sets the due date.' },
    paymentMethod: { readOnly: ctx.readOnly, hint: 'Defaults from the customer.' },
    cashDiscountDays: { readOnly: ctx.readOnly, hint: 'Days added to the posting date before the early-payment discount window starts.' },
    journalRemark: { readOnly: ctx.readOnly, hint: 'Defaults to "Sales Orders – customer code".' },
    // BP project lives in the References card (aside), not the journal entry.
  }),
};

/** Shared by the A/R invoice and the sales reserve invoice (same drawer fields today). */
function arInvoiceConfig(
  errors: Errors,
  readOnly: boolean,
  accounts: Account[] | undefined,
  remark: string,
) {
  return {
    paymentTerm: { hint: 'Drives the due date.' },
    paymentMethod: {},
    cashDiscountDays: {},
    installments: { error: errors.installments, hint: 'Splits the balance due into equal parts, a payment-term period apart.' },
    flags: [
      { key: 'paymentBlock' as const, label: 'Payment block' },
      { key: 'maxCashDiscount' as const, label: 'Max. cash discount' },
    ],
    journalRemark: { hint: `Defaults to "${remark}".` },
    account: { role: 'receivable' as const, key: 'controlAccount' as const, label: 'Control account', accounts, readOnly, error: errors.controlAccount, hint: "The customer's receivable account, from the customer record." },
    // BP project and federal tax ID live in the References card (aside), not the journal entry.
  };
}

export const arInvoicePayment: PaymentDef<ArSectionProps['draft'], { ctx: ArSectionProps['ctx']; m: ArSectionProps['m'] }> = {
  build: ({ errors, ctx, m }) => arInvoiceConfig(errors, ctx.readOnly, m.accounts, 'A/R Invoices – customer code'),
};

export const arReserveInvoicePayment: PaymentDef<RiSectionProps['draft'], { ctx: RiSectionProps['ctx']; m: RiSectionProps['m'] }> = {
  build: ({ errors, ctx, m }) => arInvoiceConfig(errors, ctx.readOnly, m.accounts, 'Reserve Invoice – customer code'),
};

export const deliveryPayment: PaymentDef<DnSectionProps['draft'], { ctx: DnSectionProps['ctx'] }> = {
  build: () => ({
    paymentTerm: { hint: 'From the order or customer; carries to the invoice.' },
    paymentMethod: {},
    cashDiscountDays: {},
    journalRemark: { hint: 'The journal entry\'s remark. Defaults to "Deliveries – customer code".' },
    // BP project and federal tax ID live in the References card (aside), not the journal entry.
  }),
};

export const arCreditMemoPayment: PaymentDef<ArCmSectionProps['draft'], { ctx: ArCmSectionProps['ctx']; m: ArCmSectionProps['m'] }> = {
  build: ({ errors, ctx, m }) => ({
    paymentTerm: { hint: 'Carries to the credit memo.' },
    journalRemark: { hint: 'Defaults to "A/R Credit Memos – customer code".' },
    account: {
      role: 'receivable',
      key: 'controlAccount',
      label: 'Control account',
      accounts: m.accounts,
      required: true,
      readOnly: ctx.readOnly,
      error: errors.controlAccount,
      hint: "The customer's receivable account by default.",
    },
    // BP project and federal tax ID live in the References card (aside), not the journal entry.
  }),
};

export const salesReturnPayment: PaymentDef<SrSectionProps['draft'], { ctx: SrSectionProps['ctx'] }> = {
  build: () => ({
    paymentTerm: { hint: 'Carries to the credit memo.' },
    journalRemark: { hint: 'Defaults to "Sales Returns – customer code".' },
    // BP project and federal tax ID live in the References card (aside), not the journal entry.
  }),
};
