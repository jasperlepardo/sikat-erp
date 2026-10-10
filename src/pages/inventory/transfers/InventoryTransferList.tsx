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
import { TRANSFER_STATUSES, type InventoryTransfer } from '../../../mocks/inventoryTransfers';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { destinations, listTransfers, transferNumber, transferQty, transferValue } from '../../../services/inventoryTransfers';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { TRANSFER_LIST_PATH, TRANSFER_STATUS_INTENT } from './InventoryTransferDetail';

export function InventoryTransferList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const transfers = useAsync(listTransfers, []);
  const fields = [
    textField<InventoryTransfer>('no', 'No.', transferNumber),
    textField<InventoryTransfer>('from', 'From warehouse', (d) => d.fromWarehouse),
    textField<InventoryTransfer>('to', 'To warehouse', destinations),
    dateField<InventoryTransfer>('postingDate', 'Posting date', (d) => d.postingDate),
    numberField<InventoryTransfer>('qty', 'Quantity', transferQty),
    numberField<InventoryTransfer>('value', 'Value', transferValue),
    statusField<InventoryTransfer>(TRANSFER_STATUSES),
    masterField<InventoryTransfer>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    textField<InventoryTransfer>('remarks', 'Remarks', (d) => d.remarks),
    linesField<InventoryTransfer>(),
  ];
  const presets = useListPresets({
    list: 'inventory-transfers',
    fields,
    builtIns: statusViews('stock movements', TRANSFER_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: transfers,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(transfers ?? []).filter(
      (t) =>
        (!q ||
          [transferNumber(t), t.fromWarehouse, ...destinations(t), t.remarks, ...t.lines.map((l) => `${l.itemNo} ${l.description}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (t: InventoryTransfer): string | number =>
      sort.key === 'value' ? transferValue(t) : sort.key === 'docNum' ? t.docNum : String(t[sort.key as keyof InventoryTransfer] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [transfers, presets.filter, query, sort]);

  const open = (t: InventoryTransfer) => navigate(`${TRANSFER_LIST_PATH}/${t.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<InventoryTransfer>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (t) => <TableLink onClick={() => open(t)}>{transferNumber(t)}</TableLink>,
    },
    {
      key: 'fromWarehouse',
      header: 'From → To',
      sortable: true,
      cell: (t) => (
        <TableSubcontent subcopy={t.remarks || undefined}>
          {t.fromWarehouse} → {destinations(t).join(', ') || '—'}
        </TableSubcontent>
      ),
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (t) => formatDate(t.postingDate) },
    {
      key: 'qty',
      header: 'Quantity',
      cell: (t) => (
        <TableSubcontent subcopy={`${t.lines.length} line${t.lines.length === 1 ? '' : 's'}`}>
          {transferQty(t).toLocaleString('en-PH')}
        </TableSubcontent>
      ),
    },
    {
      key: 'value',
      header: 'Value at cost',
      sortable: true,
      cell: (t) => <TableAmount currency="PHP">{formatAmount(transferValue(t))}</TableAmount>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (t) => <TableStatus intent={TRANSFER_STATUS_INTENT[t.status]}>{t.status}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search transfers"
        searchPlaceholder="Search by transfer no., warehouse, item or remarks"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="move_down"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${TRANSFER_LIST_PATH}/new`)}
          >
            New transfer
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
        <Card className={fillCardClass(onPage.length)}>
          {transfers ? (
            <Table
              caption="Inventory transfers"
              columns={columns}
              rows={onPage}
              getRowId={(t) => t.id}
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
            <Text tone="muted" className="p-4">Loading transfers…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
