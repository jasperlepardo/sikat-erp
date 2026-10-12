import { Section, bind } from '../../../../components/form/fields';
import type { QtTabProps } from './types';

export function QtDatesCard({ draft, update, errors, ctx }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <div className="flex flex-col gap-2">
          {h.date('postingDate', 'Quotation date', {
            required: true,
            error: errors.postingDate,
            disabled: ctx.added,
          })}
          {h.date('validUntil', 'Valid until', {
            hint: 'After this date the quotation is expired.',
          })}
        </div>
      </Section>
    </fieldset>
  );
}
