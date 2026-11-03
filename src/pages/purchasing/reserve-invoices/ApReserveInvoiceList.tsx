import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { AP_RI_STATUSES, type ApReserveInvoice } from '../../../mocks/apReserveInvoices';
import { todayISO, formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { apRiNumber, apRiTotals, listApReserveInvoices } from '../../../services/apReserveInvoices';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { APRI_LIST_PATH, APRI_NOUN, AP_RI_STATUS_INTENT } from '../paths';

export function ApReserveInvoiceList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listApReserveInvoices(), taxCodes.list()]), []);
  const [invoices, codes] = data ?? [undefined, []];
  const totalOf = (inv: ApReserveInvoice) =>
    apRiTotals(inv, (code) => {
      const c = codes?.find((x) => x.code === code);
      return c?.rates?.[0]?.rate ?? 0;
    }).total;
  const today = todayISO();

  const fields = [
    textField<ApReserveInvoice>('no', 'No.', apRiNumber),
    partnerField<ApReserveInvoice>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, invoices),
    textField<ApReserveInvoice>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<ApReserveInvoice>('vendorRef', 'Vendor invoice no.', (d) => d.vendorRef),
    dateField<ApReserveInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ApReserveInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ApReserveInvoice>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<ApReserveInvoice>('total', 'Total', totalOf),
    statusField<ApReserveInvoice>(scopeStatuses(draftsOnly, AP_RI_STATUSES)),
    masterField<ApReserveInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ApReserveInvoice>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<ApReserveInvoice>(),
  ];

  const allColumns: ListColumn<ApReserveInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (inv) => <TableContent href={`#${APRI_LIST_PATH}/${inv.docNum ? apRiNumber(inv) : inv.id}`} subcopy={inv.vendorRef ? `Vendor invoice no. ${inv.vendorRef}` : undefined}>{apRiNumber(inv)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (inv) => <TableContent subcopy={inv.vendorCode}>{inv.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (inv) => formatDate(inv.postingDate) },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (inv) => <TableContent subcopy={inv.status === 'Open' && inv.dueDate && inv.dueDate < today ? 'Overdue' : inv.paymentBlock ? 'Payment block' : undefined}>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</TableContent> },
    { key: 'orderNumber', header: 'Purchase order', sortable: true, defaultHidden: true, cell: (inv) => (inv.orderNumber ? `PO ${inv.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'total', header: 'Total', sortable: true, cell: (inv) => <TableAmount currency={inv.currency}>{formatAmount(totalOf(inv))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (inv) => <TableStatus intent={AP_RI_STATUS_INTENT[inv.status]}>{inv.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('ap-reserve-invoices', allColumns);

  return (
    <ListPage
      rows={invoices}
      columns={columns}
      fields={fields}
      noun={APRI_NOUN}
      icon="receipt_long"
      basePath={APRI_LIST_PATH}
      listKey="ap-reserve-invoices"
      builtIns={draftSplit(draftsOnly, APRI_NOUN.many, AP_RI_STATUSES)}
      scope={draftScope(draftsOnly, AP_RI_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by invoice no., vendor, vendor invoice no., or PO no.', label: `Search ${APRI_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${APRI_NOUN.many} yet. Start one from a purchase order (More actions › Create ${APRI_NOUN.one}), or with New ${APRI_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? apRiNumber(r) : r.id}
      filterFn={(inv, q) => !q || [apRiNumber(inv), inv.vendorCode, inv.vendorName, inv.vendorRef, inv.orderNumber, ...inv.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (inv: ApReserveInvoice): string | number =>
          sort.key === 'total' ? totalOf(inv) : sort.key === 'docNum' ? inv.docNum : String(inv[sort.key as keyof ApReserveInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
