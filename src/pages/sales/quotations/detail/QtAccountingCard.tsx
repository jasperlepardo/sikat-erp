import { ReadOnly, Section, bind } from '../../../../components/form/fields';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

export function QtAccountingCard({ draft, update, ctx }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="account_balance" title="Accounting">
        <div className="flex flex-col gap-2">
          {h.text('journalRemark', 'Journal remark')}
          {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
          {h.master('projectId', 'BP project', projectDef, { clearable: true })}
          {h.text('indicator', 'Indicator')}
          <ReadOnly label="Federal tax ID" value={ctx.customer?.tin || '—'} hint="The customer's TIN." />
        </div>
      </Section>
    </fieldset>
  );
}
