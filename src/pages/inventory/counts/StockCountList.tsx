import { useMemo, useState, type ReactNode } from 'react';
import { nameIn, salesEmployees } from '../../../services/partnerMasters';
import { useLocation } from 'react-router';
import {
  Alert,
  Card,
  Panel,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  Text,
  type PanelHeaderProps,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { cap } from '../../../components/form/noun';
import { fillCardClass, useListPage } from '../../../components/form/DataTable';
import { EMPTY_FILTER } from '../../../components/filter/engine';
import { dateField, linesField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { COUNT_STATUSES, type InventoryCounting, type InventoryPosting } from '../../../mocks/inventoryCountings';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { countNumber, countSummary, countWarehouses, listCountings, listPostings, postingNumber, postingTotal } from '../../../services/inventoryCountings';
import { useAsync } from '../../../services/useAsync';
import { COUNT_LIST_PATH, COUNT_NOUN, COUNT_STATUS_INTENT, POSTING_LIST_PATH, POSTING_NOUN } from '../paths';

type View = 'counts' | 'postings';
type SearchProps = Pick<PanelHeaderProps, 'showSearch' | 'searchPlaceholder' | 'searchValue' | 'onSearchChange'>;

/**
 * Stock counts, or the inventory postings made from them: each has its own route, sidebar entry and
 * presets, so the page shows the kind its route says.
 */
function CountsShell({
  view,
  title,
  search,
  filters,
  panel,
  children,
}: {
  view: View;
  /** The preset menu. */
  title: ReactNode;
  /** The header search (from `list.search`). */
  search: SearchProps;
  /** The filter chips (`presets.bar`). */
  filters: ReactNode;
  /** The preset side panel. */
  panel: ReactNode;
  children: ReactNode;
}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const postings = view === 'postings';
  return (
    <Panel className="flex-1">
      <PageHeader
        icon="inventory"
        title={title}
        {...search}
        create={postings ? { noun: POSTING_NOUN, to: POSTING_LIST_PATH } : { noun: COUNT_NOUN, to: COUNT_LIST_PATH }}
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
  const { resetPage, paginate } = useListPage();
  const sortRows = (rows: T[], value: (row: T, key: string) => string | number) => {
    if (!sort) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  };
  const table = (caption: string, columns: TableColumn<T>[], rows: T[] | undefined, getRowId: (r: T) => string) => {
    if (!rows) return <Card><Text tone="muted" className="p-4">Loading…</Text></Card>;
    const { visible, pagination } = paginate(rows);
    return (
      <Card className={fillCardClass(visible.length)}>
        <Table
          caption={caption}
          columns={columns}
          rows={visible}
          getRowId={getRowId}
          sort={sort}
          onSortChange={setSort}
          layout="fill"
          pagination={pagination}
        />
      </Card>
    );
  };
  const search = (placeholder: string): SearchProps => ({
    showSearch: true,
    searchPlaceholder: placeholder,
    searchValue: query,
    onSearchChange: (value) => {
      setQuery(value);
      resetPage();
    },
  });
  return { query: query.trim().toLowerCase(), sortRows, table, search, resetPage };
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
  const counts = useAsync(listCountings, []);
  const presets = useListPresets({
    list: 'stock-counts',
    fields: COUNT_FIELDS,
    builtIns: statusViews(COUNT_NOUN.many, COUNT_STATUSES),
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

  const columns: TableColumn<InventoryCounting>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (c) => <TableContent href={`#${COUNT_LIST_PATH}/${c.id}`}>{countNumber(c)}</TableContent> },
    { key: 'warehouses', header: 'Warehouse', cell: (c) => <TableContent subcopy={c.remarks || undefined}>{countWarehouses(c).join(', ') || '—'}</TableContent> },
    { key: 'countDate', header: 'Count date', sortable: true, cell: (c) => `${formatDate(c.countDate)} ${c.countTime}` },
    {
      key: 'counters',
      header: 'Counted by',
      cell: (c) => (
        <TableContent subcopy={c.countingType === 'multiple' ? 'Multiple counters' : undefined}>{c.counters.map((x) => nameIn(salesEmployees, x.employeeId)).join(', ')}</TableContent>
      ),
    },
    {
      key: 'progress',
      header: 'Counted',
      cell: (c) => {
        const s = countSummary(c);
        const notes = [s.withVariance ? `${s.withVariance} with variance` : '', s.disagreements ? `${s.disagreements} counters differ` : ''].filter(Boolean).join(' · ');
        return (
          <TableContent subcopy={notes || undefined}>
            {s.counted} of {s.lines}
          </TableContent>
        );
      },
    },
    { key: 'status', header: 'Status', sortable: true, cell: (c) => <TableStatus intent={COUNT_STATUS_INTENT[c.status]}>{c.status}</TableStatus> },
  ];

  return (
    <CountsShell
      view="counts"
      title={presets.menu}
      search={list.search('Search by count no., warehouse, counter, item or remarks')}
      filters={presets.bar(null)}
      panel={presets.panel}
    >
      {list.table(cap(COUNT_NOUN.many), columns, rows, (c) => c.id)}
    </CountsShell>
  );
}

export function InventoryPostingList() {
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
    builtIns: [{ id: 'all', name: `All ${POSTING_NOUN.many}`, filter: EMPTY_FILTER }],
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

  const columns: TableColumn<InventoryPosting>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (p) => <TableContent href={`#${POSTING_LIST_PATH}/${p.id}`}>{postingNumber(p)}</TableContent> },
    { key: 'warehouses', header: 'Warehouse', cell: (p) => <TableContent subcopy={p.remarks || undefined}>{countWarehouses(p).join(', ') || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (p) => formatDate(p.postingDate) },
    { key: 'count', header: 'From count', cell: (p) => (countOf(p) ? countNumber(countOf(p)!) : '— Direct') },
    { key: 'lines', header: 'Lines', cell: (p) => String(p.lines.length) },
    { key: 'total', header: 'Total', sortable: true, cell: (p) => <TableAmount currency="PHP">{formatAmount(postingTotal(p))}</TableAmount> },
  ];

  return (
    <CountsShell
      view="postings"
      title={presets.menu}
      search={list.search('Search by posting no., warehouse, item or remarks')}
      filters={presets.bar(null)}
      panel={presets.panel}
    >
      {list.table(cap(POSTING_NOUN.many), columns, rows, (p) => p.id)}
    </CountsShell>
  );
}
