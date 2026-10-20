import { useEffect, type CSSProperties } from 'react';
import { Badge, Button, Card, Icon, Link, List, Panel, PanelHeader, SidePanel, Table, TableAmount, TableContent, TableStatus, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../components/form/fields';
import type { ApLine } from '../../../mocks/apInvoices';
import type { OutgoingPayment } from '../../../mocks/outgoingPayments';
import { rateAt, vatNotPaidToVendor } from '../../../mocks/taxes';
import { apTotals } from '../../../services/apInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { paymentNumber, rowSettled } from '../../../services/outgoingPayments';
import { lineNet, paymentTermName } from '../../../services/purchaseOrders';
import { AP_LIST_PATH } from '../../purchasing/vendor-invoices/detail/ApInvoiceDetail';
import { BANK_PAYMENTS_PATH, BILL_STATUS_INTENT, OP_STATUS_INTENT, dueFlag, type Bill, type PayablesMasters } from './payables';

/**
 * A bill, read-only, over the right 60% of the screen: its details, lines and totals, and the
 * payments applied to it — which is what explains a partial payment. Closes with Esc or Close.
 */
export function InvoicePanel({ bill, m, payments, onClose }: { bill: Bill; m: PayablesMasters; payments: readonly OutgoingPayment[]; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const inv = bill.invoice;
  const code = inv.currency;
  const vendor = m.vendors.find((v) => v.id === inv.vendorId);
  const taxOf = (taxCode: string) => m.tax.codes.find((c) => c.code === taxCode);
  const rateOf = (taxCode: string) => {
    const c = taxOf(taxCode);
    return c ? (rateAt(c, inv.postingDate) ?? 0) : 0;
  };
  const totals = apTotals(inv, rateOf, undefined, (c) => vatNotPaidToVendor(taxOf(c)));
  // What the total gives up before it's owed: withholding taken off and down payments drawn.
  const withheld = Math.round((totals.total - inv.downPayment - bill.total) * 100) / 100;
  const flag = dueFlag(bill);
  const applied = payments
    .flatMap((p) => p.rows.filter((r) => r.invoiceId === inv.id && r.selected && r.amount > 0).map((r) => ({ p, amount: rowSettled(r) })))
    .filter(({ p }) => p.status === 'Posted' || p.status === 'Cancelled')
    .sort((a, b) => a.p.postingDate.localeCompare(b.p.postingDate));

  const lineColumns: TableColumn<ApLine>[] = [
    { key: 'item', header: 'Item', cell: (l) => <TableContent subcopy={l.itemNo || undefined}>{l.description || l.itemNo}</TableContent> },
    { key: 'qty', header: 'Qty', align: 'end', cell: (l) => `${l.quantity} ${l.uomName || ''}`.trim() },
    { key: 'price', header: 'Unit price', align: 'end', cell: (l) => formatAmount(l.unitPrice) },
    { key: 'tax', header: 'Tax', cell: (l) => taxOf(l.taxCode)?.name ?? (l.taxCode || '—') },
    { key: 'total', header: 'Line total', align: 'end', cell: (l) => <TableAmount currency={code}>{formatAmount(lineNet(l))}</TableAmount> },
  ];
  const totalRows: [string, number, boolean?][] = [
    ['Untaxed', totals.beforeDiscount],
    ...(totals.discount ? [['Discount', -totals.discount] as [string, number]] : []),
    ['VAT', totals.tax],
    ...(totals.freight ? [['Freight', totals.freight] as [string, number]] : []),
    ['Total', totals.total],
    ...(withheld ? [['Less withholding', -withheld] as [string, number]] : []),
    ...(inv.downPayment ? [['Less down payments', -inv.downPayment] as [string, number]] : []),
    ['Paid to date', -inv.appliedAmount],
    ['Open amount', bill.balanceDue, true],
  ];

  return (
    <SidePanel overlay onOverlayClick={onClose} style={{ '--sikat-side-panel-width': '60vw' } as CSSProperties}>
      <PanelHeader
        type="details"
        icon="request_quote"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={
          <span className="flex flex-col">
            <span>{bill.no}</span>
            <Text as="span" variant="small" tone="muted">{vendor?.name ?? inv.vendorName}</Text>
          </span>
        }
        status={
          <span className="flex gap-1">
            <Badge size="small" intent={BILL_STATUS_INTENT[bill.status]}>{bill.status}</Badge>
            {flag ? <Badge size="small" intent={flag.intent}>{flag.label}</Badge> : null}
          </span>
        }
        actions={
          <>
            <Link intent="primary" href={`#${AP_LIST_PATH}/${inv.id}`}>Open in Purchasing</Link>
            <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>Close</Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <Section icon="description" title="Invoice details">
          <Fields>
            <ReadOnly label="Vendor" value={vendor?.name ?? inv.vendorName} description={vendor?.code} />
            <ReadOnly label="Currency" value={code} />
            <ReadOnly label="Vendor invoice no." value={inv.vendorRef || '—'} />
            <ReadOnly label="Payment terms" value={inv.paymentTermId ? paymentTermName(inv.paymentTermId) : '—'} />
            <ReadOnly label="Posting date" value={formatDate(inv.postingDate)} />
            <ReadOnly label="Due date" value={inv.dueDate ? formatDate(inv.dueDate) : '—'} />
            <ReadOnly label="Document date" value={formatDate(inv.documentDate)} />
          </Fields>
        </Section>

        <Card>
          <Table caption="Invoice lines" columns={lineColumns} rows={inv.lines} getRowId={(l) => l.id} scroll />
        </Card>

        <Section icon="functions" title="Totals">
          <List.Group divider>
            {totalRows.map(([label, n, bold]) => (
              <List.Item
                key={label}
                title={bold ? <strong>{label}</strong> : label}
                content={<span className={`whitespace-nowrap tabular-nums ${bold ? 'font-semibold' : ''}`}>{code} {formatAmount(n)}</span>}
              />
            ))}
          </List.Group>
        </Section>

        <Section icon="payments" title="Payments applied">
          {applied.length ? (
            <List.Group divider>
              {applied.map(({ p, amount }) => (
                <List.Item
                  key={p.id}
                  href={`#${BANK_PAYMENTS_PATH}/${p.docNum ? paymentNumber(p) : p.id}`}
                  title={paymentNumber(p)}
                  content={
                    <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
                      {formatDate(p.postingDate)} · {code} {formatAmount(amount)}
                      <TableStatus intent={OP_STATUS_INTENT[p.status]}>{p.status}</TableStatus>
                    </span>
                  }
                />
              ))}
            </List.Group>
          ) : (
            <Text tone="muted">No payments applied yet.</Text>
          )}
        </Section>

        <Section icon="notes" title="Remarks">
          <Text>{inv.remarks || <span className="text-(--color-text-placeholder)">No remarks.</span>}</Text>
        </Section>

        <Section icon="attach_file" title="Attachments">
          {inv.attachments.length ? (
            <List.Group divider>
              {inv.attachments.map((a) => (
                <List.Item key={a.id} leading={<Icon size={20}>attach_file</Icon>} title={a.fileName} />
              ))}
            </List.Group>
          ) : (
            <Text tone="muted">The vendor's invoice file isn't attached.</Text>
          )}
        </Section>
      </Panel.Body>
    </SidePanel>
  );
}
