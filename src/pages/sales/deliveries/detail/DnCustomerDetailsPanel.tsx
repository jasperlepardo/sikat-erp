import { Button, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import type { DnSectionProps } from './types';

interface DnCustomerDetailsPanelProps extends DnSectionProps {
  open: boolean;
  onClose: () => void;
}

/** The shared customer panel, plus the payment details a delivery carries to its invoice. */
export function DnCustomerDetailsPanel({ draft, update, errors, ctx, open, onClose }: DnCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;

  const customer = ctx.customer;
  const h = bind(draft, update);

  const computedDue = soDueDate(draft.postingDate, termDays(draft.paymentTermId), draft.dueMonths, draft.dueDays);
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, termDays(draft.paymentTermId), next.dueMonths, next.dueDays) });
  };

  return (
    <CustomerDetailsPanel
      customer={customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="delivery"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from sales order."
    >
      <Section icon="account_balance" title="Payment">
        <Fields cols={1}>
          {h.text('journalRemark', 'Journal remark', { hint: "The journal entry's remark. Defaults to \"Deliveries – customer code\"." })}
          {h.master('projectId', 'BP project', projectDef, { clearable: true })}
          {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'From the order or customer; carries to the invoice.' })}
          {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          {h.date('dueDate', 'Due date', {
            error: errors.dueDate,
            hint: (
              <>
                = {computedDue || '—'}.{' '}
                {draft.dueDate !== computedDue ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ dueDate: computedDue })}>
                    Recalculate due date
                  </Button>
                ) : null}
              </>
            ),
          })}
          <div className="grid grid-cols-2 gap-2">
            <TextField aria-label="Recalculate due date: months" type="number" min={0} suffix="months" value={String(draft.dueMonths)} onChange={(e) => setRecalc({ dueMonths: Number(e.currentTarget.value) || 0 })} />
            <TextField aria-label="Recalculate due date: days" type="number" min={0} suffix="days" value={String(draft.dueDays)} onChange={(e) => setRecalc({ dueDays: Number(e.currentTarget.value) || 0 })} />
            <Text variant="small" tone="muted" className="col-span-2">
              Manually recalculate due date: months and days from the posting date instead of the terms.
            </Text>
          </div>
          {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
        </Fields>
      </Section>
      <Section icon="tag" title="Tax">
        <Fields cols={1}>
          <ReadOnly label="Federal tax ID" value={draft.federalTaxId || <span className="text-muted">Customer has no TIN on file</span>} />
        </Fields>
      </Section>
    </CustomerDetailsPanel>
  );
}
