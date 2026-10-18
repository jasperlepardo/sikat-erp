import { Button, FormField, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { formatDate } from '../../../../services/dates';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import type { RiSectionProps } from './types';

interface RiCustomerDetailsPanelProps extends RiSectionProps {
  open: boolean;
  onClose: () => void;
}

/** The shared customer panel, plus how the reserve invoice is paid and where it posts. */
export function RiCustomerDetailsPanel({ draft, update, errors, ctx, m, open, onClose }: RiCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;

  const h = bind(draft, update);
  const days = termDays(draft.paymentTermId);
  const computedDue = soDueDate(draft.postingDate, days, draft.dueMonths, draft.dueDays);
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, days, next.dueMonths, next.dueDays) });
  };
  const receivables = m.accounts.filter((a) => a.control && a.drawer === 'Assets' && a.active && !a.title);

  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="reserve invoice"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from."
    >
      <Section icon="payments" title="Payment">
        <Fields cols={1}>
          {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Drives the due date.' })}
          {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          {h.date('dueDate', 'Due date', {
            required: true,
            error: errors.dueDate,
            hint: (
              <>
                = {computedDue ? formatDate(computedDue) : '—'}.{' '}
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
            <Text variant="small" tone="muted" className="col-span-2">Manually recalculate due date: from the posting date instead of the payment terms.</Text>
          </div>
          {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
          {h.num('installments', 'Installments', { error: errors.installments, hint: 'Splits the balance due into equal parts, a payment-term period apart.' })}
        </Fields>
        <Flags>
          {h.check('paymentBlock', 'Payment block')}
          {h.check('maxCashDiscount', 'Max. cash discount')}
        </Flags>
        <Text variant="small" tone="muted">Payment block keeps the invoice out of collection and payment runs.</Text>
      </Section>
      <Section icon="account_balance" title="Accounting">
        <Fields cols={1}>
          {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Reserve Invoice – customer code".' })}
          <FormField label="Control account" error={errors.controlAccount} tooltip="The customer's receivable account, from the customer record.">
            {(p) => (
              <Select
                {...p}
                disabled={ctx.readOnly}
                options={[...receivables.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })), ...(draft.controlAccount && !receivables.some((a) => a.code === draft.controlAccount) ? [{ value: draft.controlAccount, label: draft.controlAccount }] : [])]}
                value={draft.controlAccount}
                onValueChange={(controlAccount) => update({ controlAccount })}
              />
            )}
          </FormField>
          {h.master('projectId', 'BP project', projectDef, { clearable: true })}
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
