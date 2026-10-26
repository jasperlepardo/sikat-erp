import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import type { PoTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function PoDatesCard({ draft, update, errors, m }: PoTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="event" title="Dates & references">
      <FieldStack>
        {f.date('requiredDate', 'Required date', {
          error: errors.requiredDate,
          hint: 'When the goods must leave the vendor to arrive by the delivery date.',
        })}
        {f.date('cancellationDate', 'Cancellation date', {
          error: errors.cancellationDate,
          hint: 'After this date the PO is cancelled and you\'re no longer committed.',
        })}
        {f.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true })}
        <ReadOnly
          label="Federal tax ID"
          value={m.tax.company.tin || <span className="text-muted">Not set — Settings › Accounting & Tax › Company tax profile</span>}
          hint={`${m.tax.company.registeredName}'s TIN.`}
        />
        {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number, for direct distribution to a chain\'s stores.' })}
      </FieldStack>
    </Section>
  );
}
