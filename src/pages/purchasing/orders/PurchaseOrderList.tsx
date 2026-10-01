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
import { PO_STATUSES, type PoStatus, type PurchaseOrder } from '../../../mocks/purchaseOrders';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, openQty, poNumber, poTotal } from '../../../services/purchaseOrders';
import { useAsync } from '../../../services/useAsync';
import { PO_LIST_PATH, STATUS_INTENT } from './detail/PurchaseOrderDetail';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../components/form/DataTable';

type Filter = 'all' | PoStatus;

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseOrders(), taxCodes.list()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (po: PurchaseOrder) => poTotal(po, codes);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (orders ?? []).filter(
      (po) =>
        (filter === 'all' || po.status === filter) &&
        (!q ||
          [poNumber(po), po.vendorCode, po.vendorName, po.vendorRef, ...po.lines.map((l) => `${l.itemNo} ${l.description}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (po: PurchaseOrder): string | number =>
      sort.key === 'total' ? totalOf(po) : sort.key === 'docNum' ? po.docNum : String(po[sort.key as keyof PurchaseOrder] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query, sort, codes]);

  const open = (po: PurchaseOrder) => navigate(`${PO_LIST_PATH}/${po.id}`);
  const count = (f: Filter) => String(orders?.filter((po) => f === 'all' || po.status === f).length ?? '');

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (po) => (
        <TableSubcontent subcopy={po.vendorRef ? `Vendor ref. ${po.vendorRef}` : undefined}>
          <TableLink onClick={() => open(po)}>{poNumber(po)}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (po) => <TableSubcontent subcopy={po.vendorCode}>{po.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (po) => po.postingDate },
    { key: 'deliveryDate', header: 'Delivery date', sortable: true, cell: (po) => po.deliveryDate || '—' },
    {
      key: 'received',
      header: 'Received',
      cell: (po) => {
        const ordered = po.lines.reduce((n, l) => n + l.quantity, 0);
        const left = po.lines.reduce((n, l) => n + openQty(l), 0);
        return (
          <TableSubcontent subcopy={`${po.lines.length} line${po.lines.length === 1 ? '' : 's'}`}>
            {ordered - left} of {ordered}
          </TableSubcontent>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      cell: (po) => <TableAmount currency={po.currency}>{formatAmount(totalOf(po))}</TableAmount>,
    },
    { key: 'status', header: 'Status', sortable: true, cell: (po) => <TableStatus intent={STATUS_INTENT[po.status]}>{po.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="receipt_long"
        title="Purchase Orders"
        subcopy="Orders placed with vendors, from draft to fully received."
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="extra-large"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${PO_LIST_PATH}/new`)}
          >
            New purchase order
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
            items={(['all', ...PO_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
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
          aria-label="Search purchase orders"
          placeholder="Search by PO no., vendor, vendor ref. or item"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className="table-fill">
          {orders ? (
            <Table
              caption="Purchase orders"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(po) => po.id}
              sort={sort}
              onSortChange={setSort}
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
            <Text tone="muted" className="p-4">Loading purchase orders…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}
