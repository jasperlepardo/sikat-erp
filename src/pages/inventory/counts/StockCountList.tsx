import { useMemo, useState, type ReactNode } from 'react';
import { nameIn, salesEmployees } from '../../../services/partnerMasters';
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
  type PanelHeaderProps,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { EMPTY_FILTER } from '../../../components/filter/engine';
import { dateField, linesField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { COUNT_STATUSES, type InventoryCounting, type InventoryPosting } from '../../../mocks/inventoryCountings';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { countNumber, countSummary, countWarehouses, listCountings, listPostings, postingNumber, postingTotal } from '../../../services/inventoryCountings';
import { useAsync } from '../../../services/useAsync';
import { COUNT_STATUS_INTENT } from './StockCountDetail';
import { COUNT_LIST_PATH, POSTING_LIST_PATH } from './shared';

type View = 'counts' | 'postings';
type SearchProps = Pick<PanelHeaderProps, 'showSearch' | 'searchPlaceholder' | 'searchValue' | 'onSearchChange'>;

/** Stock Counts: the counting documents, and the postings made from them — a tab each, with their own presets. */
function CountsShell({
  view,
  title,
  counts,
  search,
  filters,
  panel,
  children,
}: {
  view: View;
  /** The preset menu. */
  title: ReactNode;
  counts: Partial<Record<View, number>>;
  /** The header search (from `list.search`). */
  search: SearchProps;
  /** The filter chips (`presets.bar`). */
  filters: ReactNode;
  /** The preset side panel. */
  panel: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const postings = view === 'postings';
  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory"
        title={title}
        {...search}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="large"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${postings ? POSTING_LIST_PATH : COUNT_LIST_PATH}/new`)}
          >
            {postings ? 'New posting' : 'New count'}
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={view}
            onValueChange={(v) => navigate(v === 'postings' ? POSTING_LIST_PATH : COUNT_LIST_PATH)}
            items={(['counts', 'postings'] as View[]).map((v) => ({
              value: v,
              label: v === 'counts' ? 'Counts' : 'Inventory postings',
              badge: counts[v] === undefined ? '' : String(counts[v]),
            }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {filters}
        {children}
      </Panel.Body>
      {panel}
    </Panel>
  );
}

/** Search box + sortable, paginated table, shared by both lists. Sort comes from the list's presets. */
function useListState<T>({ sort, setSort }: { sort: TableSort | null; setSort: (sort: TableSort | null) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const sortRows = (rows: T[], value: (row: T, key: string) => string | number) => {
    if (!sort) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  };
  const table = (caption: string, columns: TableColumn<T>[], rows: T[] | undefined, getRowId: (r: T) => string, onOpen: (r: T) => void) => {
    const onPage = (rows ?? []).slice((page - 1) * pageSize, page * pageSize);
    return (
      <Card className={fillCardClass(onPage.length)}>
        {rows ? (
          <Table
            caption={caption}
            columns={columns}
            rows={onPage}
            getRowId={getRowId}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            onRowAction={onOpen}
            pagination={{
              page,
              pageSize,
              total: rows.length,
              pageSizes: PAGE_SIZES,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading…</Text>
        )}
      </Card>
    );
  };
  const search = (placeholder: string): SearchProps => ({
    showSearch: true,
    searchPlaceholder: placeholder,
    searchValue: query,
    onSearchChange: (value) => {
      setQuery(value);
      setPage(1);
    },
  });
  return { query: query.trim().toLowerCase(), sortRows, table, search, resetPage: () => setPage(1) };
}

const COUNT_FIELDS = [
  textField<InventoryCounting>('no', 'No.', countNumber),
  textField<InventoryCounting>('warehouse', 'Warehouse', countWarehouses),
  dateField<InventoryCounting>('countDate', 'Count date', (c) => c.countDate),
  textField<InventoryCounting>('counter', 'Counted by', (c) => c.counters.map((x) => nameIn(salesEmployees, x.employeeId))),
  textField<InventoryCounting>('reference', 'Reference', (c) => c.reference),
  textField<InventoryCounting>('remarks', 'Remarks', (c) => c.remarks),
  numberField<InventoryCounting>('variance', 'Lines with variance', (c) => countSummary(c).withVariance),
  statusField<InventoryCounting>(COUNT_STATUSES),
  linesField<InventoryCounting>(),
];

export function StockCountList() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listCountings(), listPostings()]), []);
  const counts = data?.[0];
  const presets = useListPresets({
    list: 'stock-counts',
    fields: COUNT_FIELDS,
    builtIns: statusViews('counts', COUNT_STATUSES),
    defaultSort: { key: 'countDate', direction: 'desc' },
    rows: counts,
    onChange: () => {
      list.resetPage();
    },
  });
  const list = useListState<InventoryCounting>(presets);

  const rows = useMemo(() => {
    if (!counts) return undefined;
    const filtered = presets.apply(counts).filter(
      (c) =>
        !list.query ||
          [countNumber(c), c.reference, c.remarks, ...c.counters.map((x) => nameIn(salesEmployees, x.employeeId)), ...countWarehouses(c), ...c.lines.map((l) => `${l.itemNo} ${l.description}`)]
            .join(' ')
            .toLowerCase()
            .includes(list.query),
    );
    return list.sortRows(filtered, (c, key) => (key === 'docNum' ? c.docNum : String(c[key as keyof InventoryCounting] ?? '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, presets.filter, list.query, list.sortRows]);

  const open = (c: InventoryCounting) => navigate(`${COUNT_LIST_PATH}/${c.id}`);
  const columns: TableColumn<InventoryCounting>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (c) => <TableLink onClick={() => open(c)}>{countNumber(c)}</TableLink> },
    { key: 'warehouses', header: 'Warehouse', cell: (c) => <TableSubcontent subcopy={c.remarks || undefined}>{countWarehouses(c).join(', ') || '—'}</TableSubcontent> },
    { key: 'countDate', header: 'Count date', sortable: true, cell: (c) => `${formatDate(c.countDate)} ${c.countTime}` },
    {
      key: 'counters',
      header: 'Counted by',
      cell: (c) => (
        <TableSubcontent subcopy={c.countingType === 'multiple' ? 'Multiple counters' : undefined}>{c.counters.map((x) => nameIn(salesEmployees, x.employeeId)).join(', ')}</TableSubcontent>
      ),
    },
    {
      key: 'progress',
      header: 'Counted',
      cell: (c) => {
        const s = countSummary(c);
        const notes = [s.withVariance ? `${s.withVariance} with variance` : '', s.disagreements ? `${s.disagreements} counters differ` : ''].filter(Boolean).join(' · ');
        return (
          <TableSubcontent subcopy={notes || undefined}>
            {s.counted} of {s.lines}
          </TableSubcontent>
        );
      },
    },
    { key: 'status', header: 'Status', sortable: true, cell: (c) => <TableStatus intent={COUNT_STATUS_INTENT[c.status]}>{c.status}</TableStatus> },
  ];

  return (
    <CountsShell
      view="counts"
      title={presets.menu}
      counts={{ counts: counts?.length, postings: data?.[1].length }}
      search={list.search('Search by count no., warehouse, counter, item or remarks')}
      filters={presets.bar(null)}
      panel={presets.panel}
    >
      {list.table('Inventory countings', columns, rows, (c) => c.id, open)}
    </CountsShell>
  );
}

export function InventoryPostingList() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listCountings(), listPostings()]), []);
  const [counts, postings] = data ?? [];
  const countOf = (p: InventoryPosting) => counts?.find((c) => c.id === p.countingId);
  const presets = useListPresets({
    list: 'inventory-postings',
    fields: [
      textField<InventoryPosting>('no', 'No.', postingNumber),
      textField<InventoryPosting>('warehouse', 'Warehouse', countWarehouses),
      dateField<InventoryPosting>('postingDate', 'Posting date', (p) => p.postingDate),
      textField<InventoryPosting>('count', 'From count', (p) => {
        const c = countOf(p);
        return c ? countNumber(c) : '';
      }),
      textField<InventoryPosting>('reference', 'Reference', (p) => p.reference),
      textField<InventoryPosting>('remarks', 'Remarks', (p) => p.remarks),
      numberField<InventoryPosting>('total', 'Total', postingTotal),
      linesField<InventoryPosting>(),
    ],
    builtIns: [{ id: 'all', name: 'All inventory postings', filter: EMPTY_FILTER }],
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: postings,
    onChange: () => {
      list.resetPage();
    },
  });
  const list = useListState<InventoryPosting>(presets);

  const rows = useMemo(() => {
    if (!postings) return undefined;
    const filtered = presets.apply(postings).filter(
      (p) =>
        !list.query ||
        [postingNumber(p), p.reference, p.remarks, p.journalRemark, ...countWarehouses(p), ...p.lines.map((l) => `${l.itemNo} ${l.description}`)]
          .join(' ')
          .toLowerCase()
          .includes(list.query),
    );
    return list.sortRows(filtered, (p, key) => (key === 'total' ? postingTotal(p) : key === 'docNum' ? p.docNum : String(p[key as keyof InventoryPosting] ?? '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postings, presets.filter, list.query, list.sortRows]);

  const open = (p: InventoryPosting) => navigate(`${POSTING_LIST_PATH}/${p.id}`);
  const columns: TableColumn<InventoryPosting>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (p) => <TableLink onClick={() => open(p)}>{postingNumber(p)}</TableLink> },
    { key: 'warehouses', header: 'Warehouse', cell: (p) => <TableSubcontent subcopy={p.remarks || undefined}>{countWarehouses(p).join(', ') || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (p) => formatDate(p.postingDate) },
    { key: 'count', header: 'From count', cell: (p) => (countOf(p) ? countNumber(countOf(p)!) : '— Direct') },
    { key: 'lines', header: 'Lines', cell: (p) => String(p.lines.length) },
    { key: 'total', header: 'Total', sortable: true, cell: (p) => <TableAmount currency="PHP">{formatAmount(postingTotal(p))}</TableAmount> },
  ];

  return (
    <CountsShell
      view="postings"
      title={presets.menu}
      counts={{ counts: counts?.length, postings: postings?.length }}
      search={list.search('Search by posting no., warehouse, item or remarks')}
      filters={presets.bar(null)}
      panel={presets.panel}
    >
      {list.table('Inventory postings', columns, rows, (p) => p.id, open)}
    </CountsShell>
  );
}
