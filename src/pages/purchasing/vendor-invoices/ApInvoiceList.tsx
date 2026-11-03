import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { AP_STATUSES, type ApInvoice } from '../../../mocks/apInvoices';
import { todayISO, formatDate, dueIn } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { AP_LIST_PATH, AP_NOUN, AP_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function ApInvoiceList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listApInvoices(), taxCodes.list()]), []);
  const [invoices, codes] = data ?? [undefined, []];
  const totalOf = (inv: ApInvoice) => apTotal(inv, codes);
  const today = todayISO();

  const fields = [
    textField<ApInvoice>('no', `${cap(AP_NOUN.one)} no.`, apNumber),
    partnerField<ApInvoice>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, invoices),
    textField<ApInvoice>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<ApInvoice>('vendorRef', 'Vendor invoice no.', (d) => d.vendorRef),
    dateField<ApInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ApInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ApInvoice>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<ApInvoice>('total', 'Total', totalOf),
    statusField<ApInvoice>(scopeStatuses(draftsOnly, AP_STATUSES)),
    masterField<ApInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ApInvoice>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<ApInvoice>(),
  ];

  const allColumns: ListColumn<ApInvoice>[] = [
    { key: 'docNum', header: `${cap(AP_NOUN.one)} no.`, locked: true, cell: (inv) => <TableContent href={`#${AP_LIST_PATH}/${inv.docNum ? apNumber(inv) : inv.id}`}>{apNumber(inv)}</TableContent> },
    { key: 'vendorRef', header: 'Vendor invoice no.', cell: (inv) => inv.vendorRef || '—' },
    { key: 'vendorName', header: 'Vendor', cell: (inv) => inv.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (inv) => <TableStatus intent={AP_STATUS_INTENT[inv.status]}>{inv.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (inv) => formatDate(inv.postingDate) },
    {
      key: 'dueDate',
      header: 'Due date',
      align: 'end',
      cell: (inv) => (inv.dueDate ? formatDate(inv.dueDate) : '—'),
    },
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
  const { columns, manager } = useListColumns('ap-invoices', allColumns);

  return (
    <ListPage
      rows={invoices}
      columns={columns}
      fields={fields}
      noun={AP_NOUN}
      icon="request_quote"
      basePath={AP_LIST_PATH}
      listKey="ap-invoices"
      builtIns={draftSplit(draftsOnly, AP_STATUSES)}
      scope={draftScope(draftsOnly, AP_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by invoice no., vendor, vendor invoice no., PO or receipt no., or item', label: 'Search bills' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${AP_NOUN.many} yet. Start one from a purchase order or goods receipt (More actions › Create ${AP_NOUN.one}), or with New ${AP_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? apNumber(r) : r.id}
      filterFn={(inv, q) => !q || [apNumber(inv), inv.vendorCode, inv.vendorName, inv.vendorRef, inv.orderNumber, ...inv.lines.map((l) => `${l.itemNo} ${l.description} ${l.baseDocNo}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (inv: ApInvoice): string | number =>
          sort.key === 'total' ? totalOf(inv) : sort.key === 'docNum' ? inv.docNum : String(inv[sort.key as keyof ApInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
