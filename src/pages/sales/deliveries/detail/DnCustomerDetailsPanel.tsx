import { Button, Panel, PanelHeader, SidePanel, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { AddressCards } from './DnSections';
import type { DnSectionProps } from './types';

interface DnCustomerDetailsPanelProps extends DnSectionProps {
  open: boolean;
  onClose: () => void;
}

export function DnCustomerDetailsPanel({ draft, update, ctx, open, onClose }: DnCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;

  const customer = ctx.customer;
  const h = bind(draft, update);

  const computedDue = soDueDate(draft.postingDate, termDays(draft.paymentTermId), draft.dueMonths, draft.dueDays);
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, termDays(draft.paymentTermId), next.dueMonths, next.dueDays) });
  };

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="person"
        title={customer.name}
        actions={
          <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>
            Done
          </Button>
        }
      />
      <Panel.Body>
        <fieldset disabled={ctx.readOnly} className="contents">
          <Section icon="person" title="Contact">
            <Fields cols={1}>
              {h.lookup('contactId', 'Contact person', [
                { value: '', label: '— None —' },
                ...(customer.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.firstName || '—' })),
              ], { disabled: !customer })}
              {h.text('customerRef', 'Customer ref. no.')}
            </Fields>
          </Section>
          <AddressCards draft={draft} update={update} ctx={ctx} />
          <Section icon="account_balance" title="Payment">
            <Fields cols={1}>
              {h.text('journalRemark', 'Journal remark', { hint: "The journal entry's remark. Defaults to \"Deliveries – customer code\"." })}
              {h.master('projectId', 'BP project', projectDef, { clearable: true })}
              {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'From the order or customer; carries to the invoice.' })}
              {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
              {h.date('dueDate', 'Due date', {
                hint: (
                  <>
                    = {computedDue || '—'}.{' '}
                    {draft.dueDate !== computedDue ? (
                      <button type="button" className="text-xs underline" onClick={() => update({ dueDate: computedDue })}>
                        Recalculate
                      </button>
                    ) : null}
                  </>
                ),
              })}
              <div className="grid grid-cols-2 gap-2">
                <input type="number" aria-label="Due months" min={0} className="border rounded px-2 py-1 text-sm" value={String(draft.dueMonths)} onChange={(e) => setRecalc({ dueMonths: Number(e.currentTarget.value) || 0 })} />
                <input type="number" aria-label="Due days" min={0} className="border rounded px-2 py-1 text-sm" value={String(draft.dueDays)} onChange={(e) => setRecalc({ dueDays: Number(e.currentTarget.value) || 0 })} />
                <Text variant="small" tone="muted" className="col-span-2">Months then days from posting date instead of the terms.</Text>
              </div>
              {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
            </Fields>
          </Section>
          <Section icon="tag" title="References">
            <Fields cols={1}>
              {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...INDICATORS.map((v) => ({ value: v, label: v }))])}
              <ReadOnly label="Federal tax ID" value={draft.federalTaxId || 'Customer has no TIN on file'} />
              {h.text('orderNumber', 'Order number', { hint: 'Set by Copy from sales order.' })}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
