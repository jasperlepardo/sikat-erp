import { FieldOrientationCtx, Form, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import type { RfqTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/** Indicator, company TIN and chain-store order number. */
export function RfqReferencesCard({ draft, update, m }: RfqTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="bookmark" title="References">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true })}
          <ReadOnly
            label="Federal tax ID"
            value={m.tax.company.tin || <span className="opacity-50">Not set — Settings › Accounting & Tax › Company tax profile</span>}
            hint={`${m.tax.company.registeredName}'s TIN.`}
          />
          {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number for cross-referencing.' })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
