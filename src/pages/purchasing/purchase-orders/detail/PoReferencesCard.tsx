import { FieldOrientationCtx, Form, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { projectDef } from '../../../settings/masterDefs';
import type { PoTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/** BP project, indicator, company TIN and chain-store order number. */
export function PoReferencesCard({ draft, update, m, ctx }: PoTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="bookmark" title="References">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor.', readOnly: ctx.readOnly })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true, readOnly: ctx.readOnly })}
          <ReadOnly
            label="Federal tax ID"
            value={m.tax.company.tin || <span className="text-muted">Not set — Settings › Accounting & Tax › Company tax profile</span>}
            hint={`${m.tax.company.registeredName}'s TIN.`}
          />
          {f.text('orderNumber', 'Order number', { hint: "Chain-store order number, for direct distribution to a chain's stores.", readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
