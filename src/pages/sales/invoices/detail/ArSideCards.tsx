import { FormField, List, Select, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { SHIPPED_GOODS_ACCOUNT } from '../../../../mocks/deliveries';
import { contactName } from '../../../../mocks/partners';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { NO_SALES_EMPLOYEE, SALES_SETTINGS, type SoDocType } from '../../../../mocks/salesOrders';
import { customerWithholds, installmentSchedule, shipsStock } from '../../../../services/arInvoices';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { paymentTermName, termDays } from '../../../../services/purchaseOrders';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { ArSectionProps } from './types';

export function ArDatesCard({ draft, update, errors, ctx }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <div className="flex flex-col gap-2">
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When revenue, VAT and any stock it ships are posted.' })}
          {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `From the payment terms (${paymentTermName(draft.paymentTermId)}).` })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </div>
      </Section>
    </fieldset>
  );
}

/** Item or service invoice, and where the cost of stock it ships goes. */
export function ArSettingsCard({ draft, update, ctx, m }: ArSectionProps) {
  const h = bind(draft, update);
  const hasLines = draft.lines.some((l) => l.itemId || l.description);
  const withholds = customerWithholds(ctx.customer);
  // Use Shipped Goods Account only matters for stock the invoice ships itself.
  const ships = draft.lines.some((l) => shipsStock(l, m.items));
  const shipped = m.accounts.find((a) => a.code === SHIPPED_GOODS_ACCOUNT);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <FormField label="Item/Service type" hint={hasLines && !ctx.added ? 'Remove the lines to change it.' : undefined}>
          {(p) => (
            <Select
              {...p}
              disabled={ctx.added || hasLines}
              options={(['Item', 'Service'] as SoDocType[]).map((t) => ({ value: t, label: t }))}
              value={draft.docType}
              onValueChange={(docType) => update({ docType: docType as SoDocType, lines: [] })}
            />
          )}
        </FormField>
        {ctx.customer ? (
          <Text variant="small" tone="muted">
            {withholds ? `${ctx.customer.name} withholds tax — WTax liable lines default on.` : `${ctx.customer.name} doesn’t withhold.`}
          </Text>
        ) : null}
        <Flags>{h.check('useShippedGoodsAccount', 'Use shipped goods account', { disabled: !ships })}</Flags>
        <Text variant="small" tone="muted">
          {!ships
            ? 'Only for stock this invoice ships itself — lines from a delivery were already costed by it.'
            : draft.useShippedGoodsAccount
              ? `The cost of the stock it ships goes to ${shipped ? `${shipped.code} ${shipped.name}` : SHIPPED_GOODS_ACCOUNT} instead of COGS.`
              : 'The cost of the stock it ships goes to COGS.'}
        </Text>
      </Section>
    </fieldset>
  );
}

export function ArBpChannelCard({ draft, update, ctx }: ArSectionProps) {
  const h = bind(draft, update);
  const customer = ctx.customer;
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="BP channel">
        <Fields cols={1}>
          {h.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee', hint: 'The marketplace or channel the order came through.' })}
          <FormField label="BP channel contact" tooltip="A contact person on the customer for the channel.">
            {(p) => (
              <Select
                {...p}
                disabled={ctx.readOnly || !customer}
                options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]}
                value={draft.bpChannelContact}
                onValueChange={(bpChannelContact) => update({ bpChannelContact })}
              />
            )}
          </FormField>
        </Fields>
      </Section>
    </fieldset>
  );
}

export function ArShipmentCard({ draft, update, ctx, m }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="route" title="Shipment & collection">
        <Fields cols={1}>
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES) : null}
          {h.text('trackingNo', 'Tracking no.', { hint: 'Carried over from the delivery when copied.' })}
        </Fields>
        <Flags>{h.check('blockDunning', 'Block dunning letters')}</Flags>
        <Text variant="small" tone="muted">Leaves the invoice out of dunning letters — for a disputed or on-hold invoice.</Text>
      </Section>
    </fieldset>
  );
}

/** Sales employee and owner; remarks stay editable after the invoice is added. */
export function ArAssignmentCard({ draft, update, ctx }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="person_search" title="Assignment">
      <fieldset disabled={ctx.readOnly} className="contents">
        <Fields cols={1}>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
        </Fields>
      </fieldset>
      {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the invoice is added.' })}
    </Section>
  );
}

/** The balance due split into equal parts, a payment-term period apart. */
export function ArInstallmentsCard({ draft, balance }: Pick<ArSectionProps, 'draft'> & { balance: number }) {
  if (draft.installments <= 1) return null;
  const schedule = installmentSchedule(draft.dueDate, draft.installments, balance, termDays(draft.paymentTermId));
  const columns: TableColumn<(typeof schedule)[number]>[] = [
    { key: 'no', header: 'Installment', cell: (r) => String(r.no) },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    { key: 'amount', header: 'Amount', align: 'end', cell: (r) => `${draft.currency} ${formatAmount(r.amount)}` },
  ];
  return (
    <DataTable
      variant="card"
      icon="calendar_month"
      title="Installments"
      description={`Balance due ${draft.currency} ${formatAmount(balance)} in ${schedule.length} parts.`}
      rows={schedule}
      getRowId={(r) => String(r.no)}
      columns={columns}
      unsortable={['no', 'dueDate', 'amount']}
      noPagination
      empty={null}
    />
  );
}

export function ArJournalCard({ journal, ctx, m, currency }: { journal: { account: string; debit: number; credit: number }[]; currency: string } & Pick<ArSectionProps, 'ctx' | 'm'>) {
  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item key={j.account} title={accountText(j.account, m.accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
          ))}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">Adding posts Dr A/R / Cr Revenue and Output VAT, plus the cost of any stock the invoice ships.</Text>
      )}
      <Text variant="small" tone="muted">In PHP{currency !== 'PHP' && ctx.fx ? ` at ${ctx.fx}` : ''}. {ctx.added ? 'As posted.' : 'Stock it ships is costed at today’s item cost.'}</Text>
    </Section>
  );
}
