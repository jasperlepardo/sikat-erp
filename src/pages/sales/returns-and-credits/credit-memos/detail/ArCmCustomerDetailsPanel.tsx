import { AccountField } from '../../../../../components/form/AccountField';
import { Fields, ReadOnly, Section, bind } from '../../../../../components/form/fields';
import { paymentTermDef, projectDef } from '../../../../settings/masterDefs';
import { CustomerDetailsPanel } from '../../../shared/CustomerDetailsPanel';
import type { ArCmSectionProps } from '../../types';

interface ArCmCustomerDetailsPanelProps extends ArCmSectionProps {
  open: boolean;
  onClose: () => void;
}

export function ArCmCustomerDetailsPanel({ draft, update, errors, ctx, m, open, onClose }: ArCmCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  const h = bind(draft, update);
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="credit memo"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from."
    >
      <Section icon="account_balance" title="Accounting">
        <Fields cols={1}>
          {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Carries to the credit memo.' })}
          {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to "A/R Credit Memos – customer code".' })}
          <AccountField
            label="Control account"
            role="receivable"
            value={draft.controlAccount}
            onChange={(controlAccount) => update({ controlAccount })}
            accounts={m.accounts}
            required
            error={errors.controlAccount}
            disabled={ctx.readOnly}
            hint="The customer's receivable account by default."
          />
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
