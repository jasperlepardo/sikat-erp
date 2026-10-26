import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { AP_RI_STATUSES, type ApReserveInvoice } from '../../../mocks/apReserveInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { apRiNumber, apRiTotals, listApReserveInvoices } from '../../../services/apReserveInvoices';
import { todayISO } from '../../../services/dates';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { useListPage } from '../../../components/form/DataTable';
import { APRI_LIST_PATH, AP_RI_STATUS_INTENT } from '../paths';

export function ApReserveInvoiceList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listApReserveInvoices(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const [invoices, codes] = data ?? [undefined, []];
  const totalOf = (inv: ApReserveInvoice) =>
    apRiTotals(inv, (code) => {
      const c = codes?.find((x) => x.code === code);
      return c?.rates?.[0]?.rate ?? 0;
    }).total;

  const fields = [
    textField<ApReserveInvoice>('no', 'No.', apRiNumber),
    textField<ApReserveInvoice>('vendor', 'Vendor', (d) => d.vendorName),
    textField<ApReserveInvoice>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<ApReserveInvoice>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<ApReserveInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ApReserveInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ApReserveInvoice>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<ApReserveInvoice>('total', 'Total', totalOf),
    statusField<ApReserveInvoice>(AP_RI_STATUSES),
    masterField<ApReserveInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ApReserveInvoice>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<ApReserveInvoice>(),
  ];
  const presets = useListPresets({
    list: 'ap-reserve-invoices',
    fields,
    builtIns: statusViews('A/P reserve invoices', AP_RI_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: invoices,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;
  const today = todayISO();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(invoices ?? []).filter(
      (inv) =>
        !q ||
        [apRiNumber(inv), inv.vendorCode, inv.vendorName, inv.vendorRef, inv.orderNumber, ...inv.lines.map((l) => `${l.itemNo} ${l.description}`)]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (inv: ApReserveInvoice): string | number =>
      sort.key === 'total' ? totalOf(inv) : sort.key === 'docNum' ? inv.docNum : String(inv[sort.key as keyof ApReserveInvoice] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, presets.filter, query, sort, codes]);

  const columns: TableColumn<ApReserveInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (inv) => (
        <TableContent href={`#${APRI_LIST_PATH}/${inv.docNum ? apRiNumber(inv) : inv.id}`} subcopy={inv.vendorRef ? `Vendor ref. ${inv.vendorRef}` : undefined}>
          {apRiNumber(inv)}
        </TableContent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (inv) => <TableContent subcopy={inv.vendorCode}>{inv.vendorName || '—'}</TableContent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (inv) => formatDate(inv.postingDate) },
    {
      key: 'dueDate',
      header: 'Due date',
      sortable: true,
      cell: (inv) => (
        <TableContent subcopy={inv.status === 'Open' && inv.dueDate && inv.dueDate < today ? 'Overdue' : inv.paymentBlock ? 'Payment block' : undefined}>
          {inv.dueDate ? formatDate(inv.dueDate) : '—'}
        </TableContent>
      ),
    },
    {
      key: 'orderNumber',
      header: 'Purchase order',
      sortable: true,
      cell: (inv) => (inv.orderNumber ? `PO ${inv.orderNumber}` : <span className="text-muted">Without PO</span>),
    },
    { key: 'total', header: 'Total', sortable: true, cell: (inv) => <TableAmount currency={inv.currency}>{formatAmount(totalOf(inv))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (inv) => <TableStatus intent={AP_RI_STATUS_INTENT[inv.status]}>{inv.status}</TableStatus> },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search reserve invoices"
        searchPlaceholder="Search by invoice no., vendor, vendor invoice no., or PO no."
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="receipt_long"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${APRI_LIST_PATH}/new`)}>
            New A/P reserve invoice
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        {invoices ? (
          <Table
            caption="A/P reserve invoices"
            columns={columns}
            rows={visible}
            getRowId={(inv) => inv.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading A/P reserve invoices…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
