import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { paymentTermName } from '../../../../services/purchaseOrders';
import type { ArSectionProps } from './types';

export function ArDatesCard({ draft, update, errors, ctx }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <FieldStack>
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When revenue, VAT and any stock it ships are posted.' })}
          {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `From the payment terms (${paymentTermName(draft.paymentTermId)}).` })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
