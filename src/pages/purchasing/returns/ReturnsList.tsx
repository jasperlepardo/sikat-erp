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
import { dateField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listCreditMemos, memoNumber, memoTotal } from '../../../services/apCreditMemos';
import { listGoodsReturns, returnNumber, returnTotal } from '../../../services/goodsReturns';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { RETURN_STATUS_INTENT } from './GoodsReturnDetail';
import { MEMO_LIST_PATH, MEMO_STATUS_INTENT, RETURN_LIST_PATH } from './types';

type Kind = 'returns' | 'memos';
type Status = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
const STATUSES: Status[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** One row for either document, so both lists share a table. */
interface Row {
  id: string;
  docNum: number;
  number: string;
  ref: string;
  vendorCode: string;
  vendorName: string;
  postingDate: string;
  base: string;
  reasons: string;
  currency: string;
  total: number;
  status: Status;
  search: string;
}

/**
 * Purchasing › Returns & Debits: goods sent back to vendors, and the vendors' credit notes.
 * One page, a tab for each document.
 */
export function ReturnsList({ kind }: { kind: Kind }) {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listGoodsReturns(), listCreditMemos(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const path = kind === 'returns' ? RETURN_LIST_PATH : MEMO_LIST_PATH;

  const all: Row[] | undefined = useMemo(() => {
    if (!data) return undefined;
    const [returns, memos, codes] = data;
    return kind === 'returns'
      ? returns.map((r) => ({
          id: r.id, docNum: r.docNum, number: returnNumber(r), ref: r.vendorRef ? `RMA ${r.vendorRef}` : '', vendorCode: r.vendorCode, vendorName: r.vendorName, postingDate: r.postingDate,
          base: [...new Set(r.lines.map((l) => l.baseDocNo && `${l.baseType === 'GRPO' ? 'Receipt' : 'A/P invoice'} ${l.baseDocNo}`).filter(Boolean))].join(', '),
          reasons: [...new Set(r.lines.map((l) => l.returnReason).filter(Boolean))].join(', '),
          currency: r.currency, total: returnTotal(r, codes), status: r.status,
          search: [returnNumber(r), r.vendorCode, r.vendorName, r.vendorRef, ...r.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
        }))
      : memos.map((c) => ({
          id: c.id, docNum: c.docNum, number: memoNumber(c), ref: c.vendorRef, vendorCode: c.vendorCode, vendorName: c.vendorName, postingDate: c.postingDate,
          base: [...new Set(c.lines.map((l) => l.baseDocNo && `${l.baseType === 'GRET' ? 'Return' : 'A/P invoice'} ${l.baseDocNo}`).filter(Boolean))].join(', '),
          reasons: [...new Set(c.lines.map((l) => l.returnReason).filter(Boolean))].join(', '),
          currency: c.currency, total: memoTotal(c, codes), status: c.status,
          search: [memoNumber(c), c.vendorCode, c.vendorName, c.vendorRef, ...c.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
        }));
  }, [data, kind]);

  const fields = [
    textField<Row>('no', 'No.', (r) => r.number),
    textField<Row>('vendor', 'Vendor', (r) => r.vendorName),
    textField<Row>('vendorCode', 'Vendor code', (r) => r.vendorCode),
    textField<Row>('ref', 'Vendor ref.', (r) => r.ref),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('base', 'Based on', (r) => r.base),
    textField<Row>('reason', 'Reason', (r) => r.reasons),
    numberField<Row>('total', 'Total credit', (r) => r.total),
    statusField<Row>(STATUSES),
    masterField<Row>('currency', 'Currency', currencyDef, (r) => r.currency),
  ];
  const presets = useListPresets({
    list: kind === 'returns' ? 'goods-returns' : 'ap-credit-memos',
    fields,
    builtIns: statusViews(kind === 'returns' ? 'goods returns' : 'A/P credit memos', STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: all,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(all ?? []).filter((r) => (!q || r.search.includes(q)));
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: Row): string | number => (sort.key === 'docNum' ? r.docNum : sort.key === 'total' ? r.total : String(r[sort.key as keyof Row] ?? ''));
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
  }, [all, presets.filter, query, sort]);

  const open = (r: Row) => navigate(`${path}/${r.id}`);
  const intent = kind === 'returns' ? RETURN_STATUS_INTENT : MEMO_STATUS_INTENT;

  const columns: TableColumn<Row>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableSubcontent subcopy={r.ref || undefined}><TableLink onClick={() => open(r)}>{r.number}</TableLink></TableSubcontent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (r) => <TableSubcontent subcopy={r.vendorCode}>{r.vendorName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'base', header: 'Based on', cell: (r) => r.base || <span className="text-muted">Entered by hand</span> },
    { key: 'reasons', header: 'Reason', cell: (r) => r.reasons || '—' },
    { key: 'total', header: 'Total credit', sortable: true, cell: (r) => <TableAmount currency={r.currency}>{formatAmount(r.total)}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={intent[r.status]}>{r.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search"
        searchPlaceholder="Search by no., vendor, vendor ref., item or base document"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="assignment_return"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${path}/new`)}>
            {kind === 'returns' ? 'New goods return' : 'New A/P credit memo'}
          </Button>
        }
        tabs={
          <div className="flex flex-col gap-2">
            <Tabs
              variant="outline"
              value={kind}
              onValueChange={(v) => {
                navigate(v === 'returns' ? RETURN_LIST_PATH : MEMO_LIST_PATH);
              }}
              items={[
                { value: 'returns', label: 'Goods returns', badge: data ? String(data[0].length) : undefined },
                { value: 'memos', label: 'A/P credit memos', badge: data ? String(data[1].length) : undefined },
              ]}
            />
          </div>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {!all ? (
            <Text tone="muted" className="p-4">Loading…</Text>
          ) : all.length ? (
            <Table
              caption={kind === 'returns' ? 'Goods returns' : 'A/P credit memos'}
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
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
                ? 'No goods returns yet. Start one from a goods receipt or A/P invoice (You can also › Copy to goods return), or with New goods return.'
                : 'No credit memos yet. Start one from an A/P invoice or goods return (You can also › Copy to A/P credit memo), or with New A/P credit memo.'}
            </Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
