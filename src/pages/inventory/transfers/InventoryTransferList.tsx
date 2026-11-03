import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { TRANSFER_STATUSES, type InventoryTransfer } from '../../../mocks/inventoryTransfers';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { destinations, listTransfers, transferNumber, transferQty, transferValue } from '../../../services/inventoryTransfers';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { TRANSFER_LIST_PATH, TRANSFER_NOUN, TRANSFER_STATUS_INTENT } from '../paths';

export function InventoryTransferList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const transfers = useAsync(listTransfers, []);
  const fields = [
    textField<InventoryTransfer>('no', 'No.', transferNumber),
    textField<InventoryTransfer>('from', 'From warehouse', (d) => d.fromWarehouse),
    textField<InventoryTransfer>('to', 'To warehouse', destinations),
    dateField<InventoryTransfer>('postingDate', 'Posting date', (d) => d.postingDate),
    numberField<InventoryTransfer>('qty', 'Quantity', transferQty),
    numberField<InventoryTransfer>('value', 'Value', transferValue),
    statusField<InventoryTransfer>(scopeStatuses(draftsOnly, TRANSFER_STATUSES)),
    masterField<InventoryTransfer>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    textField<InventoryTransfer>('remarks', 'Remarks', (d) => d.remarks),
    linesField<InventoryTransfer>(),
  ];

  const allColumns: ListColumn<InventoryTransfer>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (t) => <TableContent href={`#${TRANSFER_LIST_PATH}/${t.id}`}>{transferNumber(t)}</TableContent> },
    { key: 'fromWarehouse', header: 'From → To', sortable: true, cell: (t) => <TableContent subcopy={t.remarks || undefined}>{t.fromWarehouse} → {destinations(t).join(', ') || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (t) => formatDate(t.postingDate) },
    { key: 'qty', header: 'Quantity', cell: (t) => <TableContent subcopy={`${t.lines.length} line${t.lines.length === 1 ? '' : 's'}`}>{transferQty(t).toLocaleString('en-PH')}</TableContent> },
    { key: 'value', header: 'Value at cost', sortable: true, cell: (t) => <TableAmount currency="PHP">{formatAmount(transferValue(t))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (t) => <TableStatus intent={TRANSFER_STATUS_INTENT[t.status]}>{t.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('inventory-transfers', allColumns);

  return (
    <ListPage
      rows={transfers}
      columns={columns}
      fields={fields}
      noun={TRANSFER_NOUN}
      icon="move_down"
      basePath={TRANSFER_LIST_PATH}
      listKey="inventory-transfers"
      builtIns={draftSplit(draftsOnly, TRANSFER_NOUN.many, TRANSFER_STATUSES)}
      scope={draftScope(draftsOnly, TRANSFER_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by transfer no., warehouse, item or remarks', label: 'Search transfers' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${TRANSFER_NOUN.many} yet. Start one from a transfer request (More actions › Create ${TRANSFER_NOUN.one}), or with New ${TRANSFER_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      filterFn={(t, q) => !q || [transferNumber(t), t.fromWarehouse, ...destinations(t), t.remarks, ...t.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (t: InventoryTransfer): string | number =>
          sort.key === 'value' ? transferValue(t) : sort.key === 'docNum' ? t.docNum : String(t[sort.key as keyof InventoryTransfer] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
