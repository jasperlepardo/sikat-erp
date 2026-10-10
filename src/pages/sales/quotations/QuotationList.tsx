import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Badge,
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
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { QUOTATION_STATUSES, type Quotation } from '../../../mocks/quotations';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listQuotations, qtNumber, qtTotal } from '../../../services/quotations';
import { useAsync } from '../../../services/useAsync';

export const QT_LIST_PATH = '/sales/quotations';

export const QT_STATUS_INTENT: Record<string, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export function QuotationList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listQuotations(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [quotes, codes] = data ?? [undefined, []];
  const totalOf = (q: Quotation) => qtTotal(q, codes);

  const today = new Date().toISOString().slice(0, 10);

  const fields = [
    textField<Quotation>('no', 'No.', qtNumber),
    textField<Quotation>('customer', 'Customer', (q) => q.customerName),
    textField<Quotation>('customerCode', 'Customer code', (q) => q.customerCode),
    textField<Quotation>('customerRef', 'Customer ref.', (q) => q.customerRef),
    dateField<Quotation>('postingDate', 'Posting date', (q) => q.postingDate),
    dateField<Quotation>('validUntil', 'Valid until', (q) => q.validUntil),
    numberField<Quotation>('total', 'Total', totalOf),
    statusField<Quotation>(QUOTATION_STATUSES),
  ];

  const presets = useListPresets({
    list: 'quotations',
    fields,
    builtIns: statusViews('quotations', QUOTATION_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: quotes,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(quotes ?? []).filter((qt) =>
      !q || [qtNumber(qt), qt.customerCode, qt.customerName, qt.customerRef, ...qt.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (qt: Quotation): string | number =>
      sort.key === 'total' ? totalOf(qt) : sort.key === 'docNum' ? qt.docNum : String(qt[sort.key as keyof Quotation] ?? '');
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, presets.filter, query, sort, codes]);

  const open = (q: Quotation) => navigate(`${QT_LIST_PATH}/${q.docNum ? qtNumber(q) : q.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<Quotation>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (q) => (
        <TableSubcontent subcopy={q.customerRef || undefined}>
          <TableLink onClick={() => open(q)}>{qtNumber(q)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (q) => <TableSubcontent subcopy={q.customerCode}>{q.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (q) => formatDate(q.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      sortable: true,
      cell: (q) => {
        if (!q.validUntil) return <Text variant="small" tone="muted">—</Text>;
        const expired = q.status === 'Open' && q.validUntil < today;
        return (
          <span className="flex items-center gap-1">
            <span className={expired ? 'text-danger' : ''}>{formatDate(q.validUntil)}</span>
            {expired ? <Badge size="small" intent="danger">Expired</Badge> : null}
          </span>
        );
      },
    },
    { key: 'total', header: 'Total', sortable: true, cell: (q) => <TableAmount currency={q.currency}>{formatAmount(totalOf(q))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (q) => <TableStatus intent={QT_STATUS_INTENT[q.status]}>{q.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search quotations"
        searchPlaceholder="Search by no., customer, or item"
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); setPage(1); }}
        icon="request_quote"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${QT_LIST_PATH}/new`)}>
            New quotation
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {quotes ? (
            <Table
              caption="Quotations"
              columns={columns}
              rows={onPage}
              getRowId={(q) => q.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{ page, pageSize, total: rows.length, pageSizes: PAGE_SIZES, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading quotations…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
