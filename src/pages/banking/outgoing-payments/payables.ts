import type { ApInvoice } from '../../../mocks/apInvoices';
import type { PaymentStatus } from '../../../mocks/outgoingPayments';
import type { Partner, PaymentAccount } from '../../../mocks/partners';
import { listApInvoices, apNumber } from '../../../services/apInvoices';
import { listDownPayments } from '../../../services/apDownPayments';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { loadAccountBalances } from '../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { banks, cardBrands, houseBankAccounts } from '../../../services/partnerMasters';
import { listPartnersByRole } from '../../../services/partners';
import { invoiceBalance, type PayMasters } from '../../purchasing/payments-made/detail/types';

export const BANK_PAYMENTS_PATH = '/banking/outgoing-payments';

/** A bill's payment status — never mixed with the payment's own Draft / Posted / Cancelled. */
export type BillStatus = 'Unpaid' | 'Partially paid' | 'Paid';
export const BILL_STATUSES: BillStatus[] = ['Unpaid', 'Partially paid', 'Paid'];
export const BILL_STATUS_INTENT: Record<BillStatus, 'default' | 'warning' | 'success'> = {
  Unpaid: 'default',
  'Partially paid': 'warning',
  Paid: 'success',
};

/** A payment's status: Draft, Posted, Cancelled ('Not Confirmed' only from Purchasing's approval flow). */
export const OP_STATUS_INTENT: Record<PaymentStatus, 'default' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Posted: 'success',
  Cancelled: 'danger',
};

/** Days a bill counts as "due soon" before its due date. */
export const DUE_SOON_DAYS = 7;

/** One posted A/P invoice, as Payables shows it. */
export interface Bill {
  id: string;
  invoice: ApInvoice;
  vendorId: string;
  no: string;
  vendorRef: string;
  dueDate: string;
  currency: string;
  /** Net payment due (after withholding and down payments). */
  total: number;
  balanceDue: number;
  status: BillStatus;
  /** Positive overdue, 0 due today, negative not yet due. */
  daysOverdue: number;
}

/** Everything the Payables screens read, loaded once: the payment form's masters plus banks and balances. */
export interface PayablesMasters extends PayMasters {
  houseBanks: Awaited<ReturnType<typeof houseBankAccounts.list>>;
  bankNames: Awaited<ReturnType<typeof banks.list>>;
  /** G/L balance per account code, debit positive. */
  balances: Map<string, number>;
}

export async function loadPayablesMasters(): Promise<PayablesMasters> {
  const [vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, invoices, cards, downPayments, houseBanks, bankNames, balances] =
    await Promise.all([
      listPartnersByRole('vendor'),
      listItems(),
      loadInventoryMasters(),
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
      withholdingGroups.list(),
      currencies.list(),
      exchangeRates.list(),
      listApInvoices(),
      cardBrands.list(),
      listDownPayments(),
      houseBankAccounts.list(),
      banks.list(),
      loadAccountBalances(),
    ]);
  return {
    vendors,
    items,
    tax: { company, codes, groups, withholding, withholdingGroups: wGroups },
    currencies: curs,
    rates,
    invoices,
    accounts: inv.accounts,
    cardBrands: cards,
    downPayments,
    houseBanks,
    bankNames,
    balances,
  };
}

const DAY = 86400000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Posted bills only: drafts, bills awaiting approval and cancelled bills never appear. */
export function billsOf(m: PayMasters, today: string): Bill[] {
  return m.invoices
    .filter((inv) => inv.status === 'Open' || inv.status === 'Closed')
    .map((inv) => {
      const { total, balanceDue } = invoiceBalance(inv, m);
      const balance = inv.status === 'Closed' ? 0 : Math.max(0, balanceDue);
      const status: BillStatus = balance <= 0 ? 'Paid' : inv.appliedAmount > 0 ? 'Partially paid' : 'Unpaid';
      return {
        id: inv.id,
        invoice: inv,
        vendorId: inv.vendorId,
        no: apNumber(inv),
        vendorRef: inv.vendorRef,
        dueDate: inv.dueDate,
        currency: inv.currency,
        total,
        balanceDue: balance,
        status,
        daysOverdue: inv.dueDate ? daysBetween(inv.dueDate, today) : 0,
      };
    });
}

/** The due flag beside a bill's status — only while a balance remains. */
export function dueFlag(b: Pick<Bill, 'balanceDue' | 'daysOverdue' | 'dueDate'>): { label: string; intent: 'danger' | 'warning' } | null {
  if (b.balanceDue <= 0 || !b.dueDate) return null;
  if (b.daysOverdue > 0) return { label: `Overdue ${b.daysOverdue}d`, intent: 'danger' };
  if (b.daysOverdue === 0) return { label: 'Due today', intent: 'warning' };
  if (-b.daysOverdue <= DUE_SOON_DAYS) return { label: `Due in ${-b.daysOverdue}d`, intent: 'warning' };
  return null;
}

/** "PHP 134,840.00" per currency, joined: a selection can span vendors in different currencies. */
export function sumByCurrency(rows: { currency: string; amount: number }[], format: (n: number) => string) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, Math.round(((totals.get(r.currency) ?? 0) + r.amount) * 100) / 100);
  return [...totals].map(([c, n]) => `${c} ${format(n)}`).join(' + ') || format(0);
}

/** The vendor's default bank account for transfers, or undefined when none is on file. */
export function vendorBankAccount(v: Partner | undefined): PaymentAccount | undefined {
  const method = v?.paymentMethods.find((pm) => pm.code === 'BANK' && pm.include);
  const accounts = (method?.accounts ?? []).filter((a) => a.active && a.accountNo);
  return accounts.find((a) => a.id === method?.defaultAccountId) ?? accounts[0];
}

const last4 = (accountNo = '') => accountNo.replace(/\D/g, '').slice(-4);

/** "BDO Unibank ••3301". */
export function vendorBankText(a: PaymentAccount, m: Pick<PayablesMasters, 'bankNames'>) {
  const bank = m.bankNames.find((b) => b.id === a.bankId)?.name ?? 'Bank';
  return `${bank} ••${last4(a.accountNo)}`;
}

/** Our own bank account by its G/L account, named — "BDO Unibank ••7890" — never the G/L code. */
export function houseBankText(glAccount: string, m: Pick<PayablesMasters, 'houseBanks' | 'bankNames' | 'accounts'>) {
  const hb = m.houseBanks.find((h) => h.glAccount === glAccount);
  if (hb) return `${m.bankNames.find((b) => b.id === hb.bankId)?.name ?? 'Bank'} ••${last4(hb.accountNo)}`;
  return m.accounts.find((a) => a.code === glAccount)?.name ?? '';
}
