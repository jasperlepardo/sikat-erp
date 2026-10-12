import { ReadOnly, Section, Fields, bind } from '../../../components/form/fields';
import { paymentTermDef, projectDef } from '../../settings/masterDefs';
import { CustomerDetailsPanel } from '../shared/CustomerDetailsPanel';
import type { SrSectionProps } from './types';

interface SrCustomerDetailsPanelProps extends SrSectionProps {
  open: boolean;
  onClose: () => void;
}

/** The shared customer panel, plus where the return posts. */
export function SrCustomerDetailsPanel({ draft, update, ctx, open, onClose }: SrCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  const h = bind(draft, update);
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="return"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from delivery."
    >
      <Section icon="account_balance" title="Accounting">
        <Fields cols={1}>
          {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Sales Returns – customer code”.' })}
          {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Carries to the credit memo.' })}
          {h.master('projectId', 'BP project', projectDef, { clearable: true })}
        </Fields>
      </Section>
      <Section icon="tag" title="Tax">
        <Fields cols={1}>
          <ReadOnly label="Federal tax ID" value={draft.federalTaxId || ctx.customer.tin || <span className="text-muted">Customer has no TIN on file</span>} />
        </Fields>
      </Section>
    </CustomerDetailsPanel>
  );
}
