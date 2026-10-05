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
  TextField,
  type TableColumn,
  type TableSort,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { GR_STATUSES, type GoodsReceipt, type GrStatus } from '../../../mocks/goodsReceipts';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { GR_LIST_PATH, GR_STATUS_INTENT } from './detail/GoodsReceiptDetail';

type Filter = 'all' | GrStatus;

export function GoodsReceiptList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listGoodsReceipts(), taxCodes.list()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [receipts, codes] = data ?? [undefined, []];
  const totalOf = (gr: GoodsReceipt) => grTotal(gr, codes);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (receipts ?? []).filter(
      (gr) =>
        (filter === 'all' || gr.status === filter) &&
        (!q ||
          [grNumber(gr), gr.vendorCode, gr.vendorName, gr.vendorRef, gr.orderNumber, ...gr.lines.map((l) => `${l.itemNo} ${l.description}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (gr: GoodsReceipt): string | number =>
      sort.key === 'total' ? totalOf(gr) : sort.key === 'docNum' ? gr.docNum : String(gr[sort.key as keyof GoodsReceipt] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, filter, query, sort, codes]);

  const open = (gr: GoodsReceipt) => navigate(`${GR_LIST_PATH}/${gr.id}`);
  const count = (f: Filter) => String(receipts?.filter((gr) => f === 'all' || gr.status === f).length ?? '');

  const columns: TableColumn<GoodsReceipt>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (gr) => (
        <TableSubcontent subcopy={gr.vendorRef ? `Vendor ref. ${gr.vendorRef}` : undefined}>
          <TableLink onClick={() => open(gr)}>{grNumber(gr)}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (gr) => <TableSubcontent subcopy={gr.vendorCode}>{gr.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (gr) => formatDate(gr.postingDate) },
    { key: 'orderNumber', header: 'Purchase order', sortable: true, cell: (gr) => (gr.orderNumber ? `PO ${gr.orderNumber}` : <span className="text-muted">Without PO</span>) },
    {
      key: 'quantity',
      header: 'Quantity',
      cell: (gr) => (
        <TableSubcontent subcopy={`${gr.lines.length} line${gr.lines.length === 1 ? '' : 's'}`}>
          {gr.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString('en-PH')}
        </TableSubcontent>
      ),
    },
    { key: 'total', header: 'Total', sortable: true, cell: (gr) => <TableAmount currency={gr.currency}>{formatAmount(totalOf(gr))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (gr) => <TableStatus intent={GR_STATUS_INTENT[gr.status]}>{gr.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory"
        title="Goods Receipts"
        subcopy="Goods and services received from vendors. Adding a receipt puts the stock in and updates the PO it came from."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${GR_LIST_PATH}/new`)}>
            New goods receipt
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={(['all', ...GR_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        <TextField
          aria-label="Search goods receipts"
          placeholder="Search by receipt no., vendor, vendor ref., PO no. or item"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {receipts ? (
            <Table
              caption="Goods receipts"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(gr) => gr.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
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
            <Text tone="muted" className="p-4">Loading goods receipts…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}
