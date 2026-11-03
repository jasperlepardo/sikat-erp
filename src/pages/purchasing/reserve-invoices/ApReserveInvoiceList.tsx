import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { AP_RI_STATUSES, type ApReserveInvoice } from '../../../mocks/apReserveInvoices';
import { todayISO, formatDate, dueIn } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { apRiNumber, apRiTotals, listApReserveInvoices } from '../../../services/apReserveInvoices';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { APRI_LIST_PATH, APRI_NOUN, AP_RI_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

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
    textField<ApReserveInvoice>('no', `${cap(APRI_NOUN.one)} no.`, apRiNumber),
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
    { key: 'docNum', header: `${cap(APRI_NOUN.one)} no.`, locked: true, cell: (inv) => <TableContent href={`#${APRI_LIST_PATH}/${inv.docNum ? apRiNumber(inv) : inv.id}`}>{apRiNumber(inv)}</TableContent> },
    { key: 'vendorRef', header: 'Vendor invoice no.', cell: (inv) => inv.vendorRef || '—' },
    { key: 'vendorName', header: 'Vendor', cell: (inv) => inv.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (inv) => <TableStatus intent={AP_RI_STATUS_INTENT[inv.status]}>{inv.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (inv) => formatDate(inv.postingDate) },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (inv) => (inv.dueDate ? formatDate(inv.dueDate) : '—') },
    {
      key: 'dueIn',
      header: 'Due',
      cell: (inv) => {
        const due = inv.status === 'Open' && inv.dueDate ? dueIn(inv.dueDate, today) : undefined;
        if (!due) return inv.paymentBlock ? 'Payment block' : '—';
        return <TableContent subcopy={inv.paymentBlock ? 'Payment block' : undefined}><span className={due.overdue ? 'text-danger' : undefined}>{due.text}</span></TableContent>;
      },
    },
    { key: 'orderNumber', header: 'Purchase order', defaultHidden: true, cell: (inv) => (inv.orderNumber ? `${inv.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'total', header: 'Total', align: 'end', cell: (inv) => formatMoney(totalOf(inv), inv.currency) },
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
      builtIns={draftSplit(draftsOnly, AP_RI_STATUSES)}
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
