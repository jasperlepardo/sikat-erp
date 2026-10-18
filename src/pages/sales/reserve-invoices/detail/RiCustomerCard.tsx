import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { paymentTermName } from '../../../../services/purchaseOrders';
import type { RiSectionProps } from './types';

export function RiDatesCard({ draft, update, errors, ctx }: RiSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <FieldStack>
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When A/R, revenue, and VAT are posted (no stock movement).' })}
          {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `From the payment terms (${paymentTermName(draft.paymentTermId)}).` })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
