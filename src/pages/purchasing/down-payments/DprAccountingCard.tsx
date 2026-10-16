import { Flags, Section, bind } from '../../../components/form/fields';
import { Fields } from '../../../components/form/fields';
import { ReadOnly } from '../../../components/form/fields';
import { AccountField } from '../../../components/form/AccountField';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { ReferencesTable } from '../orders/detail/AccountingTab';
import { paymentTermDef, projectDef } from '../../settings/masterDefs';
import type { DprSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function DprAccountingCard({ draft, update, errors, m, ctx }: DprSectionProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;

  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Accounting">
        <Fields>
          {h.text('journalRemark', 'Journal remark', { hint: 'Used on the payment that pays it.' })}
          <AccountField label="Down payment account" role="downPaymentClearing" value={draft.downPaymentAccount} onChange={(downPaymentAccount) => update({ downPaymentAccount })} accounts={m.accounts} required error={errors.downPaymentAccount} disabled={ctx.readOnly} hint="Where the advance sits once paid: the vendor's down payment account, else Advances to Suppliers." />
          {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Sets the due date.' })}
          {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          <ReadOnly label="Installments" value={String(draft.installments)} />
          {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
          {h.master('projectId', 'BP project', projectDef, { clearable: true })}
          {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
          <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
          <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO the lines were copied from." />
        </Fields>
        <Flags>{h.check('paymentBlock', 'Payment block')}</Flags>
      </Section>
      <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this request refers to, e.g. the vendor's proforma invoice." />
    </div>
  );
}
