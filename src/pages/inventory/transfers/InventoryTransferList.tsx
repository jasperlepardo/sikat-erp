import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Alert,
  Card,
  Panel,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { cap } from '../../../components/form/noun';
import { TRANSFER_STATUSES, type InventoryTransfer } from '../../../mocks/inventoryTransfers';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { destinations, listTransfers, transferNumber, transferQty, transferValue } from '../../../services/inventoryTransfers';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { fillCardClass, useListPage } from '../../../components/form/DataTable';
import { TRANSFER_LIST_PATH, TRANSFER_NOUN, TRANSFER_STATUS_INTENT } from '../paths';

export function InventoryTransferList() {
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
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({
    list: 'inventory-transfers',
    fields,
    builtIns: statusViews(TRANSFER_NOUN.many, TRANSFER_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: transfers,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

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

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<InventoryTransfer>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (t) => <TableContent href={`#${TRANSFER_LIST_PATH}/${t.id}`}>{transferNumber(t)}</TableContent>,
    },
    {
      key: 'fromWarehouse',
      header: 'From → To',
      sortable: true,
      cell: (t) => (
        <TableContent subcopy={t.remarks || undefined}>
          {t.fromWarehouse} → {destinations(t).join(', ') || '—'}
        </TableContent>
      ),
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (t) => formatDate(t.postingDate) },
    {
      key: 'qty',
      header: 'Quantity',
      cell: (t) => (
        <TableContent subcopy={`${t.lines.length} line${t.lines.length === 1 ? '' : 's'}`}>
          {transferQty(t).toLocaleString('en-PH')}
        </TableContent>
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
      <PageHeader
        showSearch
        searchLabel="Search transfers"
        searchPlaceholder="Search by transfer no., warehouse, item or remarks"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="move_down"
        title={presets.menu}
        create={{ noun: TRANSFER_NOUN, to: TRANSFER_LIST_PATH }}
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
              caption={cap(TRANSFER_NOUN.many)}
              columns={columns}
              rows={onPage}
              getRowId={(t) => t.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
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
