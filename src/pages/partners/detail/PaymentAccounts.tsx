import type { ReactNode } from 'react';
import { BANKS, COUNTRIES } from '../../../mocks/masters';
import { newPaymentAccount, type PaymentAccount } from '../../../mocks/partners';
import { Fields, bind, type Errors } from './fields';

const CARD_BRANDS = ['Visa', 'Mastercard', 'American Express', 'JCB', 'UnionPay'];

export type Binder = ReturnType<typeof bind<PaymentAccount>>;

/** What a payment method keeps per account, and how its accounts read and are edited. */
export interface AccountKind {
  /** e.g. "bank account", "GCash account", "card". */
  noun: string;
  icon: string;
  title: (a: PaymentAccount) => string;
  /** Label/value rows on the account's card. */
  details: (a: PaymentAccount) => { label: string; value?: string }[];
  /** Field errors that block saving the account. */
  check: (a: PaymentAccount) => Errors;
  fields: (f: Binder, a: PaymentAccount, errors: Errors, currencies: string[]) => ReactNode;
  /** Values a new account starts with, from the partner. */
  prefill: (partner: { name: string; currency: string }) => Partial<PaymentAccount>;
}

const wallet = (name: string): AccountKind => ({
  noun: `${name} account`,
  icon: 'account_balance_wallet',
  title: (a) => [a.mobileNo, a.accountName].filter(Boolean).join(' · ') || `New ${name} account`,
  details: (a) => [{ label: 'Account name', value: a.accountName }],
  check: (a): Errors => (a.mobileNo?.trim() ? {} : { mobileNo: `Enter the ${name} mobile number.` }),
  fields: (f, _a, errors) => (
    <Fields>
      {f.text('mobileNo', 'Mobile number', { type: 'tel', placeholder: 'e.g. 0917 123 4567', required: true, error: errors.mobileNo })}
      {f.text('accountName', 'Account name', { placeholder: 'e.g. Juan Dela Cruz', hint: `As shown in the ${name} app.` })}
    </Fields>
  ),
  prefill: (p) => ({ accountName: p.name }),
});

/** Methods that hold accounts; the rest (cash, checks) have none. */
const ACCOUNT_KINDS: Record<string, AccountKind> = {
  BANK: {
    noun: 'bank account',
    icon: 'account_balance',
    title: (a) => [a.bank, a.accountNo].filter(Boolean).join(' · ') || 'New bank account',
    details: (a) => [
      { label: 'Account name', value: a.accountName },
      { label: 'Branch', value: a.branch },
      { label: 'Currency', value: a.currency },
      { label: 'BIC/SWIFT', value: a.swift },
    ],
    check: (a) => ({
      ...(a.bank ? {} : { bank: 'Pick the bank.' }),
      ...(a.accountNo?.trim() ? {} : { accountNo: 'Enter the account number.' }),
    }),
    fields: (f, a, errors, currencies) => (
      <Fields>
        {f.pick('country', 'Bank country/region', COUNTRIES)}
        {f.pick('bank', 'Bank name', BANKS, { required: true, error: errors.bank, placeholder: 'Select a bank' })}
        {f.text('branch', 'Branch', { placeholder: 'e.g. Ayala Avenue' })}
        {f.text('accountNo', 'Account no.', { placeholder: 'e.g. 0012-3456-7890', required: true, error: errors.accountNo })}
        {f.text('accountName', 'Account name', { placeholder: 'e.g. Acme Trading Corp.', hint: 'As registered with the bank.' })}
        {f.text('swift', 'BIC/SWIFT code', { placeholder: 'e.g. BNORPHMM', hint: 'Needed for foreign transfers.' })}
        {f.pick('currency', 'Currency', [...new Set([...currencies, a.currency ?? ''].filter(Boolean))])}
      </Fields>
    ),
    prefill: (p) => ({ country: 'Philippines', accountName: p.name, currency: p.currency === 'All currencies' ? 'PHP' : p.currency }),
  },
  GCASH: wallet('GCash'),
  MAYA: wallet('Maya'),
  CARD: {
    noun: 'card',
    icon: 'credit_card',
    title: (a) => (a.last4 ? `${a.cardBrand ?? 'Card'} •••• ${a.last4}` : 'New card'),
    details: (a) => [
      { label: 'Cardholder', value: a.accountName },
      { label: 'Expires', value: a.expiry },
    ],
    check: (a) => ({
      ...(a.cardBrand ? {} : { cardBrand: 'Pick the card brand.' }),
      ...(/^\d{4}$/.test(a.last4 ?? '') ? {} : { last4: 'Enter the last 4 digits.' }),
    }),
    fields: (f, _a, errors) => (
      <Fields>
        {f.pick('cardBrand', 'Brand', CARD_BRANDS, { required: true, error: errors.cardBrand })}
        {f.text('last4', 'Last 4 digits', {
          placeholder: 'e.g. 4242',
          required: true,
          error: errors.last4,
          hint: 'Only the last 4 digits are kept, never the full card number.',
        })}
        {f.text('accountName', 'Cardholder name', { placeholder: 'As printed on the card' })}
        {f.text('expiry', 'Expiry', { placeholder: 'MM/YY' })}
      </Fields>
    ),
    prefill: (p) => ({ accountName: p.name }),
  },
};

/** How `code`'s accounts work, or undefined when the method has none (cash, checks). */
export const accountKind = (code: string): AccountKind | undefined => ACCOUNT_KINDS[code];

/** A blank account for `code`, prefilled from the partner. */
export const newAccountFor = (code: string, partner: { name: string; currency: string }) =>
  newPaymentAccount(accountKind(code)?.prefill(partner) ?? {});
