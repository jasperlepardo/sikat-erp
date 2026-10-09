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
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { GR_STATUSES, type GoodsReceipt } from '../../../mocks/goodsReceipts';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { GR_LIST_PATH, GR_STATUS_INTENT } from './detail/GoodsReceiptDetail';

export function GoodsReceiptList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listGoodsReceipts(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [receipts, codes] = data ?? [undefined, []];
  const totalOf = (gr: GoodsReceipt) => grTotal(gr, codes);
  const fields = [
    textField<GoodsReceipt>('no', 'No.', grNumber),
    textField<GoodsReceipt>('vendor', 'Vendor', (d) => d.vendorName),
    textField<GoodsReceipt>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<GoodsReceipt>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<GoodsReceipt>('postingDate', 'Posting date', (d) => d.postingDate),
    textField<GoodsReceipt>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<GoodsReceipt>('total', 'Total', totalOf),
    statusField<GoodsReceipt>(GR_STATUSES),
    masterField<GoodsReceipt>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<GoodsReceipt>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<GoodsReceipt>(),
  ];
  const presets = useListPresets({
    list: 'goods-receipts',
    fields,
    builtIns: statusViews('goods receipts', GR_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: receipts,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(receipts ?? []).filter(
      (gr) =>
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
  }, [receipts, presets.filter, query, sort, codes]);

  const open = (gr: GoodsReceipt) => navigate(`${GR_LIST_PATH}/${gr.id}`);

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
        showSearch
        searchLabel="Search goods receipts"
        searchPlaceholder="Search by receipt no., vendor, vendor ref., PO no. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="inventory"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${GR_LIST_PATH}/new`)}>
            New goods receipt
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
      {presets.panel}
    </Panel>
  );
}
