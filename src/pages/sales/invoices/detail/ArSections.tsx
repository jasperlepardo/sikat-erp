import { Button, FormField, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { SHIPPED_GOODS_ACCOUNT } from '../../../../mocks/deliveries';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { contactName } from '../../../../mocks/partners';
import { INDICATORS, LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { installmentSchedule, shipsStock } from '../../../../services/arInvoices';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { AddressCards } from '../../deliveries/detail/DnSections';
import type { ArSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function ArLogistics({ draft, update, m, ctx }: ArSectionProps) {
  const f = bind(draft, update);
  const customer = ctx.customer;
  return (
    <div className="flex flex-col gap-2">
      <AddressCards draft={draft} update={update} ctx={ctx} />
      <Section icon="route" title="Shipment & collection">
        <Fields>
          {f.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
          {SALES_SETTINGS.multiLanguageSupport ? f.pick('language', 'Language', LANGUAGES) : null}
          {f.text('trackingNo', 'Tracking no.', { hint: 'Carried over from the delivery when copied.' })}
        </Fields>
        <Flags>{f.check('blockDunning', 'Block dunning letters')}</Flags>
        <Text variant="small" tone="muted">Leaves the invoice out of dunning letters — for a disputed or on-hold invoice.</Text>
      </Section>
      <Section icon="storefront" title="BP channel">
        <Fields>
          {f.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee' })}
          <FormField label="BP channel contact">
            {(p) => (
              <Select {...p} disabled={ctx.readOnly || !customer} options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]} value={draft.bpChannelContact} onValueChange={(bpChannelContact) => update({ bpChannelContact })} />
            )}
          </FormField>
        </Fields>
      </Section>
    </div>
  );
}

export function ArAccounting({ draft, update, errors, m, ctx, balance }: ArSectionProps & { balance: number }) {
  const f = bind(draft, update);
  const days = termDays(draft.paymentTermId);
  const computedDue = soDueDate(draft.postingDate, days, draft.dueMonths, draft.dueDays);
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, days, next.dueMonths, next.dueDays) });
  };
  const receivables = m.accounts.filter((a) => a.control && a.drawer === 'Assets' && a.active && !a.title);
  const schedule = installmentSchedule(draft.dueDate, draft.installments, balance, days);
  // Use Shipped Goods Account only matters for stock the invoice ships itself.
  const ships = draft.lines.some((l) => shipsStock(l, m.items));
  const shipped = m.accounts.find((a) => a.code === SHIPPED_GOODS_ACCOUNT);

  const scheduleColumns: TableColumn<(typeof schedule)[number]>[] = [
    { key: 'no', header: 'Installment', cell: (r) => String(r.no) },
    { key: 'dueDate', header: 'Due date', cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    { key: 'amount', header: 'Amount', cell: (r) => <span className="tabular-nums">{draft.currency} {formatAmount(r.amount)}</span> },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & control account">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “A/R Invoices – customer code”.' })}
          <FormField label="Control account" tooltip="The customer's receivable account, from the customer record.">
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
          {f.master('project', 'BP project', projectDef, { clearable: true })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly label="Federal tax ID" value={draft.federalTaxId || <span className="text-muted">Customer has no TIN on file</span>} />
          {f.text('orderNumber', 'Order number', { hint: 'Set by Copy from.' })}
        </Fields>
        <Flags>
          {f.check('useShippedGoodsAccount', 'Use shipped goods account', { disabled: !ships })}
        </Flags>
        <Text variant="small" tone="muted">
          {!ships
            ? 'Only for stock this invoice ships itself — lines from a delivery were already costed by it.'
            : draft.useShippedGoodsAccount
              ? `The cost of the stock it ships goes to ${shipped ? `${shipped.code} ${shipped.name}` : SHIPPED_GOODS_ACCOUNT} instead of COGS.`
              : 'The cost of the stock it ships goes to COGS.'}
        </Text>
      </Section>

      <Section icon="payments" title="Payment">
        <Fields>
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Drives the due date.' })}
          {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          {f.date('dueDate', 'Due date', {
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
          {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
          {f.num('installments', 'Installments', { error: errors.installments, hint: 'Splits the balance due into equal parts, a payment-term period apart.' })}
        </Fields>
        <Flags>
          {f.check('paymentBlock', 'Payment block')}
          {f.check('maxCashDiscount', 'Max. cash discount')}
        </Flags>
        <Text variant="small" tone="muted">Payment block keeps the invoice out of collection and payment runs. Both apply once incoming payments are built.</Text>
      </Section>

      {draft.installments > 1 ? (
        <DataTable icon="calendar_month" title="Installments" description={`Balance due ${draft.currency} ${formatAmount(balance)} in ${schedule.length} parts.`} rows={schedule} getRowId={(r) => String(r.no)} columns={scheduleColumns} unsortable={['no', 'dueDate', 'amount']} noPagination empty={null} />
      ) : null}
    </div>
  );
}
