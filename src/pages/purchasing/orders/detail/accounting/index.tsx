import { Button } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { dueDateFor, termDays } from '../../../../services/purchaseOrders';
import { ReferencesTable } from '../../../shared/ReferencesTable';
import type { PoTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
export function AccountingTab({ draft, update, errors, m, ctx }: PoTabProps) {
  const f = bind(draft, update);
  const computedDue = dueDateFor(draft.postingDate, draft.paymentTermId);
  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & payment">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Purchase Orders – vendor code”. With perpetual inventory, it’s the journal entry’s remark.' })}
          {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor; sets the due date.' })}
          {f.lookup(
            'paymentMethod',
            'Payment method',
            PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })),
            { hint: 'Defaults from the vendor.' },
          )}
          {f.date('dueDate', 'Due date', {
            error: errors.dueDate,
            hint: (
              <>
                Posting date + {termDays(draft.paymentTermId)} days = {computedDue || '—'}.{' '}
                {draft.dueDate !== computedDue ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ dueDate: computedDue })}>
                    Recalculate due date
                  </Button>
                ) : null}
              </>
            ),
          })}
          {f.num('cashDiscountDays', 'Cash discount date offset', {
            suffix: 'days',
            hint: 'Days added to the posting date before the early-payment discount window starts.',
          })}
        </Fields>
      </Section>
      <Section icon="event" title="Dates & references">
        <Fields>
          {f.date('requiredDate', 'Required date', {
            error: errors.requiredDate,
            hint: 'When the goods must leave the vendor to arrive by the delivery date.',
          })}
          {f.date('cancellationDate', 'Cancellation date', {
            error: errors.cancellationDate,
            hint: 'After this date the PO is cancelled and you’re no longer committed.',
          })}
          {f.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
          <ReadOnly
            label="Federal tax ID"
            value={m.tax.company.tin || <span className="text-muted">Not set — Settings › Accounting & Tax › Company tax profile</span>}
            hint={`${m.tax.company.registeredName}’s TIN.`}
          />
          {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number, for direct distribution to a chain’s stores.' })}
        </Fields>
      </Section>
      <ReferencesTable
        refs={draft.references}
        onChange={(references) => update({ references })}
        readOnly={ctx.readOnly}
        description="Other documents this PO refers to, or that refer to it."
      />
    </div>
  );
}

