import { ReadOnly, FieldStack, Section, bind } from '../../../../components/form/fields';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import type { RfqTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function RfqDatesCard({ draft, update, m }: RfqTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="event" title="Dates & references">
      <FieldStack>
        {f.date('cancellationDate', 'Cancellation date', { hint: 'After this date the RFQ is considered cancelled.' })}
        {f.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true })}
        <ReadOnly
          label="Federal tax ID"
          value={m.tax.company.tin || <span className="opacity-50">Not set — Settings › Accounting & Tax › Company tax profile</span>}
          hint={`${m.tax.company.registeredName}'s TIN.`}
        />
        {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number for cross-referencing.' })}
      </FieldStack>
    </Section>
  );
}
