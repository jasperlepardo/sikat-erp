import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { ReferencesTable } from '../../orders/detail/AccountingTab';
import type { RfqTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function AccountingTab({ draft, update, m, ctx }: RfqTabProps) {
  const f = bind(draft, update);
  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & payment">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Purchase Quotations – vendor code".' })}
          {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor.' })}
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
        </Fields>
      </Section>
      <Section icon="event" title="Dates & references">
        <Fields>
          {f.date('cancellationDate', 'Cancellation date', {
            hint: 'After this date the RFQ is considered cancelled.',
          })}
          {f.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
          <ReadOnly
            label="Federal tax ID"
            value={m.tax.company.tin || <span className="opacity-50">Not set — Settings › Accounting & Tax › Company tax profile</span>}
            hint={`${m.tax.company.registeredName}'s TIN.`}
          />
          {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number for cross-referencing.' })}
        </Fields>
      </Section>
      <ReferencesTable
        refs={draft.references}
        onChange={(references) => update({ references })}
        readOnly={ctx.readOnly}
        description="Other documents this RFQ refers to — purchase requests, sales orders, contract references."
      />
    </div>
  );
}
