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
  Tabs,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { arCmNumber, arCmTotal, listArCreditMemos } from '../../../services/arCreditMemos';
import { listSalesReturns, srNumber, srTotal } from '../../../services/salesReturns';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { AR_CM_LIST_PATH, ARCM_STATUS_INTENT, SR_LIST_PATH, SR_STATUS_INTENT } from './types';

type Kind = 'returns' | 'memos';
type Status = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
const STATUSES: Status[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

interface Row {
  id: string;
  docNum: number;
  number: string;
  customerCode: string;
  customerName: string;
  postingDate: string;
  basedOn: string;
  currency: string;
  total: number;
  applied?: number;
  status: Status;
  search: string;
}

export function SalesReturnsList({ kind }: { kind: Kind }) {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listSalesReturns(), listArCreditMemos(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const path = kind === 'returns' ? SR_LIST_PATH : AR_CM_LIST_PATH;

  const all: Row[] | undefined = useMemo(() => {
    if (!data) return undefined;
    const [returns, memos, codes] = data;
    return kind === 'returns'
      ? returns.map((r) => ({
          id: r.id,
          docNum: r.docNum,
          number: srNumber(r),
          customerCode: r.customerCode,
          customerName: r.customerName,
          postingDate: r.postingDate,
          basedOn: [...new Set(r.lines.filter((l) => l.baseDocNo).map((l) => l.baseDocNo))].join(', '),
          currency: r.currency,
          total: srTotal(r, codes),
          status: r.status,
          search: [srNumber(r), r.customerCode, r.customerName, r.customerRef, ...r.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
        }))
      : memos.map((m) => ({
          id: m.id,
          docNum: m.docNum,
          number: arCmNumber(m),
          customerCode: m.customerCode,
          customerName: m.customerName,
          postingDate: m.postingDate,
          basedOn: [...new Set(m.lines.filter((l) => l.baseDocNo).map((l) => l.baseDocNo).filter(Boolean))].join(', '),
          currency: m.currency,
          total: arCmTotal(m, codes),
          applied: m.appliedAmount,
          status: m.status,
          search: [arCmNumber(m), m.customerCode, m.customerName, ...m.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase(),
        }));
  }, [data, kind]);

  const fields = [
    textField<Row>('no', 'No.', (r) => r.number),
    textField<Row>('customer', 'Customer', (r) => r.customerName),
    textField<Row>('customerCode', 'Customer code', (r) => r.customerCode),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('basedOn', 'Based on', (r) => r.basedOn),
    numberField<Row>('total', 'Total', (r) => r.total),
    statusField<Row>(STATUSES),
  ];

  const presets = useListPresets({
    list: kind === 'returns' ? 'sales-returns' : 'ar-credit-memos',
    fields,
    builtIns: statusViews(kind === 'returns' ? 'sales returns' : 'A/R credit memos', STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: all,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(all ?? []).filter((r) => !q || r.search.includes(q));
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: Row): string | number => (sort.key === 'docNum' ? r.docNum : sort.key === 'total' ? r.total : String(r[sort.key as keyof Row] ?? ''));
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, presets.filter, query, sort]);

  const open = (r: Row) => navigate(`${path}/${r.docNum ? r.number : r.id}`);
  const intent = kind === 'returns' ? SR_STATUS_INTENT : ARCM_STATUS_INTENT;
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const srColumns: TableColumn<Row>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableLink onClick={() => open(r)}>{r.number}</TableLink> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <TableSubcontent subcopy={r.customerCode}>{r.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'basedOn', header: 'Based on', cell: (r) => r.basedOn || <span className="text-muted">Entered by hand</span> },
    { key: 'total', header: 'Total', sortable: true, cell: (r) => <TableAmount currency={r.currency}>{formatAmount(r.total)}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={intent[r.status]}>{r.status}</TableStatus> },
  ];

  const cmColumns: TableColumn<Row>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableLink onClick={() => open(r)}>{r.number}</TableLink> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <TableSubcontent subcopy={r.customerCode}>{r.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'basedOn', header: 'Based on', cell: (r) => r.basedOn || '—' },
    { key: 'total', header: 'Total', sortable: true, cell: (r) => <TableAmount currency={r.currency}>{formatAmount(r.total)}</TableAmount> },
    { key: 'applied', header: 'Applied', cell: (r) => <TableAmount currency={r.currency}>{formatAmount(r.applied ?? 0)}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={intent[r.status]}>{r.status}</TableStatus> },
  ];

  const columns = kind === 'returns' ? srColumns : cmColumns;
  const counts = data ? { returns: data[0].length, memos: data[1].length } : undefined;

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search"
        searchPlaceholder={kind === 'returns' ? 'Search by no., customer, or item' : 'Search by no., customer, or item'}
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); setPage(1); }}
        icon="assignment_return"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${path}/new`)}>
            {kind === 'returns' ? 'New sales return' : 'New credit memo'}
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={kind}
            onValueChange={(v) => navigate(v === 'returns' ? SR_LIST_PATH : AR_CM_LIST_PATH)}
            items={[
              { value: 'returns', label: 'Sales returns', badge: counts ? String(counts.returns) : undefined },
              { value: 'memos', label: 'A/R credit memos', badge: counts ? String(counts.memos) : undefined },
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {!all ? (
            <Text tone="muted" className="p-4">Loading…</Text>
          ) : all.length ? (
            <Table
              caption={kind === 'returns' ? 'Sales returns' : 'A/R credit memos'}
              columns={columns}
              rows={onPage}
              getRowId={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{ page, pageSize, total: rows.length, pageSizes: PAGE_SIZES, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
            />
          ) : (
            <Text tone="muted" className="p-4">
              {kind === 'returns'
                ? 'No sales returns yet. Start one from a delivery (You can also › Copy to sales return), or with New sales return.'
                : 'No credit memos yet. Start one from a sales return (You can also › Copy to A/R credit memo), or with New credit memo.'}
            </Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
