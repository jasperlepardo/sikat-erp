import type { Errors } from '../../../../components/form/fields';
import type { ApInvoice } from '../../../../mocks/apInvoices';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import type { Item } from '../../../../mocks/items';
import type { PaymentRow } from '../../../../mocks/outgoingPayments';
import type { Partner } from '../../../../mocks/partners';
import { rateAt, vatNotPaidToVendor } from '../../../../mocks/taxes';
import { apNumber, apTotals, netDue } from '../../../../services/apInvoices';
import type { PaymentInput } from '../../../../services/outgoingPayments';
import { poWithholding } from '../../../../services/purchaseOrders';
import type { TaxMasterData } from '../../../../services/taxDetermination';

export type PaymentDraft = PaymentInput;

/** Master data the payment form reads, loaded once. */
export interface PayMasters {
  vendors: Partner[];
  items: Item[];
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  invoices: ApInvoice[];
  accounts: Account[];
  cardBrands: { id: string; name: string; active: boolean }[];
}

export interface PaySectionProps {
  draft: PaymentDraft;
  update: (patch: Partial<PaymentDraft>) => void;
  errors: Errors;
  m: PayMasters;
  /** PHP per unit of the payment currency on the posting date (or as posted). */
  fx: number;
  readOnly: boolean;
}

/** An invoice's net payment due (after withholding and down payments) and what's still unpaid. */
export function invoiceBalance(inv: ApInvoice, m: Pick<PayMasters, 'vendors' | 'items' | 'tax'>) {
  const rateOf = (code: string) => {
    const c = m.tax.codes.find((x) => x.code === code);
    return c ? (rateAt(c, inv.postingDate) ?? 0) : 0;
  };
  const totals = apTotals(inv, rateOf, undefined, (code) => vatNotPaidToVendor(m.tax.codes.find((x) => x.code === code)));
  const vendor = m.vendors.find((v) => v.id === inv.vendorId);
  const withholding = poWithholding(inv, vendor, m.items, m.tax, inv.postingDate);
  const total = netDue(totals.total, withholding, inv.downPayment);
  const wtAmount = Math.round(withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0) * 100) / 100;
  return { total, wtAmount, balanceDue: Math.round((total - inv.appliedAmount) * 100) / 100 };
}

/** The vendor's open invoices in the payment currency, as unticked payment rows (oldest due first). */
export function openRows(m: PayMasters, vendorId: string, currency: string, tick: string[] = []): PaymentRow[] {
  return m.invoices
    .filter((inv) => inv.vendorId === vendorId && inv.status === 'Open' && inv.currency === currency)
    .map((inv) => ({ inv, ...invoiceBalance(inv, m) }))
    .filter((x) => x.balanceDue > 0)
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate))
    .map(({ inv, total, wtAmount, balanceDue }) => ({
      id: `pr-${inv.id}`,
      invoiceId: inv.id,
      docNo: apNumber(inv),
      vendorRef: inv.vendorRef,
      docDate: inv.postingDate,
      dueDate: inv.dueDate,
      total,
      wtAmount,
      balanceDue,
      cashDiscountPct: 0,
      amount: tick.includes(inv.id) && !inv.paymentBlock ? balanceDue : 0,
      invoiceFx: inv.fxRate || 1,
      project: inv.project,
      selected: tick.includes(inv.id) && !inv.paymentBlock,
    }));
}

/** Days past due on the posting date: positive overdue, 0 due today, negative not yet due. */
export const overdueDays = (dueDate: string, postingDate: string) =>
  dueDate ? Math.round((Date.parse(`${postingDate}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000) : 0;
