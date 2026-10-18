import { Button } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { dueDateFor, termDays } from '../../../../services/purchaseOrders';
import type { PoTabProps } from './types';

export function PoJournalPaymentCard({ draft, update, errors }: PoTabProps) {
  const f = bind(draft, update);
  const computedDue = dueDateFor(draft.postingDate, draft.paymentTermId);
  return (
    <Section icon="account_balance" title="Journal & payment">
      <FieldStack>
        {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Purchase Orders – vendor code". With perpetual inventory, it\'s the journal entry\'s remark.' })}
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
      </FieldStack>
    </Section>
  );
}
