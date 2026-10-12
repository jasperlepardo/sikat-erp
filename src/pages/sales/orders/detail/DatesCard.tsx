import { FieldStack, Section, bind } from '../../../../components/form/fields';
import type { SoTabProps } from './types';

export function DatesCard({ draft, update, errors, ctx }: SoTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <FieldStack>
          {h.date('postingDate', 'Posting date', {
            required: true,
            error: errors.postingDate,
            disabled: ctx.added,
            hint: 'Sets the exchange rate, tax rates and which prices apply.',
          })}
          {h.date('deliveryDate', 'Delivery date', {
            error: errors.deliveryDate,
            hint: 'When the customer expects delivery.',
          })}
          {h.date('requiredDate', 'Required date', {
            error: errors.requiredDate,
            hint: 'When the customer needs it — for planning.',
          })}
          {h.date('cancellationDate', 'Cancellation date', {
            error: errors.cancellationDate,
            hint: 'Set when the order is cancelled or lapses.',
          })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
