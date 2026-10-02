import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Select,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Tabs,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../../components/form/DataTable';
import { Stat } from '../../../../components/Stat';
import { formatAmount } from '../../../../services/format';
import { useAsync } from '../../../../services/useAsync';
import { DOC_SOURCES, type DocType } from '../../../partners/detail/partnerDocuments';
import { docTypesFor, isBuilt, listItemDocuments, type ItemDocument } from './itemDocuments';
import type { Draft } from './types';

type Filter = 'open' | 'overdue' | 'all';

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (d: ItemDocument) => d.open && !!d.dueDate && d.dueDate < today();
const qty = (n: number) => n.toLocaleString('en-PH');
const rowsLabel = (n: number) => `${n} document row${n === 1 ? '' : 's'}`;

/**
 * Every document row the item is on — purchase requests, RFQs, POs, quotations, sales orders —
 * in one list. Types without a module yet show as "not built".
 */
export function TransactionsTab({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const types = docTypesFor(draft);
  const docs = useAsync(() => (draft.id ? listItemDocuments(draft.id, types) : Promise.resolve([])), [draft.id, types.join()]);
  const [filter, setFilter] = useState<Filter>('open');
  const [type, setType] = useState<DocType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'date', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  if (!docs) return <Text tone="muted" className="p-4">Loading transactions…</Text>;

  const ofType = docs.filter((d) => type === 'all' || d.type === type);
  const open = ofType.filter((d) => d.open);
  const overdue = ofType.filter(isOverdue);
  const q = query.trim().toLowerCase();
  const rows = (filter === 'all' ? ofType : filter === 'open' ? open : overdue).filter(
    (d) => !q || [d.number, d.subcopy, DOC_SOURCES[d.type].label, d.status].join(' ').toLowerCase().includes(q),
  );
  const dir = sort?.direction === 'asc' ? 1 : -1;
  const sortKey = sort?.key as keyof ItemDocument | undefined;
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const x = a[sortKey] ?? '';
        const y = b[sortKey] ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      })
    : rows;
  /** Open quantity in the inventory unit, e.g. "120 pc". */
  const sum = (list: ItemDocument[]) => `${qty(list.reduce((n, d) => n + d.openInventoryQty, 0))} ${draft.inventoryUom}`;
  const nextDue = [...open].filter((d) => d.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const notBuilt = types.filter((t) => !isBuilt(t)).map((t) => DOC_SOURCES[t].label.toLowerCase());

  const columns: TableColumn<ItemDocument>[] = [
    {
      key: 'number',
      header: 'Document',
      cell: (d) => (
        <TableSubcontent subcopy={[DOC_SOURCES[d.type].label, d.subcopy].filter(Boolean).join(' · ')}>
          <TableLink onClick={() => navigate(d.href)}>{d.number}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'date', header: 'Date', cell: (d) => d.date },
    { key: 'dueDate', header: 'Delivery date', cell: (d) => (isOverdue(d) ? <TableStatus intent="danger">{d.dueDate}</TableStatus> : d.dueDate || '—') },
    { key: 'status', header: 'Status', cell: (d) => <TableStatus intent={d.intent}>{d.status}</TableStatus> },
    {
      key: 'quantity',
      header: 'Quantity',
      cell: (d) => (
        <TableSubcontent subcopy={`${qty(d.openQty)} open`}>
          {qty(d.quantity)} {d.uom}
        </TableSubcontent>
      ),
    },
    { key: 'unitPrice', header: 'Unit price', cell: (d) => <TableAmount currency={d.currency}>{formatAmount(d.unitPrice)}</TableAmount> },
    { key: 'total', header: 'Total', cell: (d) => <TableAmount currency={d.currency}>{formatAmount(d.total)}</TableAmount> },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-3">
        <Stat icon="pending_actions" label="Open" value={sum(open)} sub={rowsLabel(open.length)} />
        <Stat icon="event_busy" label="Overdue" value={sum(overdue)} sub={`${overdue.length} past delivery date`} />
        <Stat
          icon="event"
          label="Next delivery"
          value={nextDue ? sum([nextDue]) : '—'}
          sub={nextDue ? `${nextDue.number} · due ${nextDue.dueDate}` : 'Nothing open'}
        />
      </div>

      {/* The Transactions card: filters and search in its body, then the table in its own card. */}
      <Card>
        <Card.Header
          icon={<Icon size={24}>receipt_long</Icon>}
          actions={
            <div className="w-56">
              <Select
                aria-label="Document type"
                options={[{ value: 'all', label: 'All document types' }, ...types.map((t) => ({ value: t, label: DOC_SOURCES[t].label }))]}
                value={type}
                onValueChange={(v) => {
                  setType((v || 'all') as DocType | 'all');
                  setPage(1);
                }}
              />
            </div>
          }
        >
          Transactions
        </Card.Header>
        <Card.Content>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={[
              { value: 'open', label: 'Open', badge: String(open.length) },
              { value: 'overdue', label: 'Overdue', badge: String(overdue.length) },
              { value: 'all', label: 'All', badge: String(ofType.length) },
            ]}
          />
          <TextField
            aria-label="Search transactions"
            placeholder="Search by document no., partner or status"
            leadingIcon={<Icon size={20}>search</Icon>}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Card className="table-scroll">
            {rows.length ? (
              <Table
                caption="Transactions"
                columns={columns.map((c) => ({ sortable: true, ...c }))}
                rows={sorted.slice((page - 1) * pageSize, page * pageSize)}
                getRowId={(d) => d.id}
                sort={sort}
                onSortChange={setSort}
                onRowAction={(d) => navigate(d.href)}
                pagination={{
                  page,
                  pageSize,
                  total: sorted.length,
                  pageSizes: PAGE_SIZES,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size);
                    setPage(1);
                  },
                }}
              />
            ) : (
              <Text variant="small" tone="muted" className="p-4">
                {query ? 'Nothing matches the search.' : filter === 'open' ? 'Nothing open.' : filter === 'overdue' ? 'Nothing overdue.' : 'No documents yet.'}
              </Text>
            )}
          </Card>
        </Card.Content>
      </Card>
      {notBuilt.length ? (
        <Text variant="small" tone="muted" className="px-2">
          Not built yet, so not listed: {notBuilt.join(', ')}.
        </Text>
      ) : null}
    </div>
  );
}
