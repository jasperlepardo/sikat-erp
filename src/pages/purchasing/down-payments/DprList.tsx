import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { DPR_STATUSES, type DownPaymentRequest } from '../../../mocks/apDownPayments';
import { dprNumber, dprTotal, listDownPayments } from '../../../services/apDownPayments';
import { listApInvoices } from '../../../services/apInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { BillsTabs } from '../invoices/BillsTabs';
import { DPR_LIST_PATH, DPR_STATUS_INTENT } from './DprDetail';

/** Purchasing › Bills › Down payment requests: advances vendors asked for, paid and drawn. */
export function DprList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDownPayments(), taxCodes.list(), listApInvoices()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [requests, codes, invoices] = data ?? [undefined, [], undefined];
  const totalOf = (d: DownPaymentRequest) => dprTotal(d, codes);
  const fields = [
    textField<DownPaymentRequest>('no', 'No.', dprNumber),
    textField<DownPaymentRequest>('vendor', 'Vendor', (d) => d.vendorName),
    textField<DownPaymentRequest>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<DownPaymentRequest>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<DownPaymentRequest>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<DownPaymentRequest>('dueDate', 'Due date', (d) => d.dueDate),
    textField<DownPaymentRequest>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<DownPaymentRequest>('total', 'Total', totalOf),
    statusField<DownPaymentRequest>(DPR_STATUSES),
    masterField<DownPaymentRequest>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<DownPaymentRequest>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyer),
    linesField<DownPaymentRequest>(),
  ];
  const presets = useListPresets({
    list: 'ap-down-payment-requests',
    fields,
    builtIns: statusViews('down payment requests', DPR_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: requests,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(requests ?? []).filter(
      (d) => (!q || [dprNumber(d), d.vendorCode, d.vendorName, d.vendorRef, d.orderNumber, ...d.lines.map((l) => l.itemNo)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (d: DownPaymentRequest): string | number => (sort.key === 'total' ? totalOf(d) : sort.key === 'docNum' ? d.docNum : String(d[sort.key as keyof DownPaymentRequest] ?? ''));
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, presets.filter, query, sort, codes]);

  const open = (d: DownPaymentRequest) => navigate(`${DPR_LIST_PATH}/${d.id}`);

  const columns: TableColumn<DownPaymentRequest>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (d) => <TableSubcontent subcopy={d.vendorRef || undefined}><TableLink onClick={() => open(d)}>{dprNumber(d)}</TableLink></TableSubcontent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (d) => <TableSubcontent subcopy={d.vendorCode}>{d.vendorName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (d) => (d.dueDate ? formatDate(d.dueDate) : '—') },
    { key: 'orderNumber', header: 'Purchase order', cell: (d) => (d.orderNumber ? `PO ${d.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'dpmPct', header: 'DPM %', cell: (d) => `${d.dpmPct}%` },
    { key: 'total', header: 'Total payment due', sortable: true, cell: (d) => <TableAmount currency={d.currency}>{formatAmount(totalOf(d))}</TableAmount> },
    {
      key: 'paid',
      header: 'Paid / drawn',
      cell: (d) => (
        <TableSubcontent subcopy={d.drawnAmount ? `${formatAmount(d.drawnAmount)} drawn` : undefined}>
          {d.appliedAmount ? (d.appliedAmount >= totalOf(d) - 0.005 ? 'Paid' : `${formatAmount(d.appliedAmount)} paid`) : 'Unpaid'}
        </TableSubcontent>
      ),
    },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => <TableStatus intent={DPR_STATUS_INTENT[d.status]}>{d.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="request_quote"
        title={presets.menu}
        subcopy="Advances vendors ask for before they deliver. Paid from Payments Made, then drawn on the A/P invoice that bills the goods."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${DPR_LIST_PATH}/new`)}>
            New down payment request
          </Button>
        }
        tabs={<BillsTabs value="requests" counts={requests && invoices ? { invoices: invoices.length, requests: requests.length } : undefined} />}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(
          <TextField
            aria-label="Search down payment requests"
            placeholder="Search by no., vendor, vendor ref., PO no. or item"
            leadingIcon={<Icon size={20}>search</Icon>}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setPage(1);
            }}
          />,
        )}
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {!requests ? (
            <Text tone="muted" className="p-4">Loading down payment requests…</Text>
          ) : requests.length ? (
            <Table
              caption="A/P down payment requests"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(d) => d.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{ page, pageSize, total: rows.length, pageSizes: PAGE_SIZES, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
            />
          ) : (
            <Text tone="muted" className="p-4">No down payment requests yet. Start one from a purchase order (You can also › Copy to A/P down payment request), or with New down payment request.</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
