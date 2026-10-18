import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { GrSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function GrAccounting({ draft, update, ctx }: GrSectionProps) {
  const f = bind(draft, update);
  return (
    <Section icon="account_balance" title="Accounting">
      <FieldStack>
        {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Goods Receipt PO – vendor code". It\'s the remark on the journal entry.' })}
        {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor or the PO.' })}
        {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the PO; sets the due date.' })}
        {f.lookup(
          'paymentMethod',
          'Payment method',
          PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })),
          { hint: 'Defaults from the vendor.' },
        )}
        {f.num('cashDiscountDays', 'Cash discount date offset', {
          suffix: 'days',
          hint: 'Days added to the posting date before the early-payment discount window starts.',
        })}
        {f.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
        <ReadOnly
          label="Federal tax ID"
          value={ctx.vendor?.tin || <span className="text-muted">{ctx.vendor ? 'Not on the vendor record' : '—'}</span>}
          hint="The vendor's TIN, from its business partner record."
        />
        <ReadOnly
          label="Order number"
          value={draft.orderNumber || '—'}
          hint="The PO the lines were copied from. Blank for a receipt entered without one."
        />
      </FieldStack>
    </Section>
  );
}
