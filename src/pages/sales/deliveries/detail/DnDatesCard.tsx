import { ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import type { DnSectionProps } from './types';

export function DnDatesCard({ draft, update, errors, ctx }: DnSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <div className="flex flex-col gap-2">
          {h.date('postingDate', 'Posting date', {
            required: true,
            error: errors.postingDate,
            disabled: ctx.added,
            hint: 'When the stock goes out and the cost is posted.',
          })}
          {h.date('deliveryDate', 'Delivery date', {
            hint: 'When it reaches the customer.',
          })}
          {h.date('documentDate', 'Document date', {
            required: true,
            error: errors.documentDate,
            disabled: ctx.added,
          })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </div>
      </Section>
    </fieldset>
  );
}
