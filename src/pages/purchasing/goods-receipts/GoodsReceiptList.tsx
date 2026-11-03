import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { GR_STATUSES, type GoodsReceipt } from '../../../mocks/goodsReceipts';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { GR_LIST_PATH, GR_NOUN, GR_STATUS_INTENT } from '../paths';

export function GoodsReceiptList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listGoodsReceipts(), taxCodes.list()]), []);
  const [receipts, codes] = data ?? [undefined, []];
  const totalOf = (gr: GoodsReceipt) => grTotal(gr, codes);

  const fields = [
    textField<GoodsReceipt>('no', 'No.', grNumber),
    partnerField<GoodsReceipt>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, receipts),
    textField<GoodsReceipt>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<GoodsReceipt>('vendorRef', 'Vendor delivery receipt no.', (d) => d.vendorRef),
    dateField<GoodsReceipt>('postingDate', 'Posting date', (d) => d.postingDate),
    textField<GoodsReceipt>('order', 'Purchase order', (d) => d.orderNumber),
    numberField<GoodsReceipt>('total', 'Total', totalOf),
    statusField<GoodsReceipt>(scopeStatuses(draftsOnly, GR_STATUSES)),
    masterField<GoodsReceipt>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<GoodsReceipt>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<GoodsReceipt>(),
  ];

  const allColumns: ListColumn<GoodsReceipt>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (gr) => <TableContent href={`#${GR_LIST_PATH}/${gr.docNum ? grNumber(gr) : gr.id}`} subcopy={gr.vendorRef ? `Vendor delivery receipt no. ${gr.vendorRef}` : undefined}>{grNumber(gr)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (gr) => <TableContent subcopy={gr.vendorCode}>{gr.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (gr) => formatDate(gr.postingDate) },
    { key: 'orderNumber', header: 'Purchase order', sortable: true, cell: (gr) => (gr.orderNumber ? `PO ${gr.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'quantity', header: 'Quantity', cell: (gr) => <TableContent subcopy={`${gr.lines.length} line${gr.lines.length === 1 ? '' : 's'}`}>{gr.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString('en-PH')}</TableContent> },
    { key: 'total', header: 'Total', sortable: true, cell: (gr) => <TableAmount currency={gr.currency}>{formatAmount(totalOf(gr))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (gr) => <TableStatus intent={GR_STATUS_INTENT[gr.status]}>{gr.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('goods-receipts', allColumns);

  return (
    <ListPage
      rows={receipts}
      columns={columns}
      fields={fields}
      noun={GR_NOUN}
      icon="inventory"
      basePath={GR_LIST_PATH}
      listKey="goods-receipts"
      builtIns={draftSplit(draftsOnly, GR_STATUSES)}
      scope={draftScope(draftsOnly, GR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by receipt no., vendor, vendor ref., PO no. or item', label: 'Search goods receipts' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${GR_NOUN.many} yet. Start one from a purchase order (More actions › Create ${GR_NOUN.one}), or with New ${GR_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? grNumber(r) : r.id}
      filterFn={(gr, q) => !q || [grNumber(gr), gr.vendorCode, gr.vendorName, gr.vendorRef, gr.orderNumber, ...gr.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (gr: GoodsReceipt): string | number =>
          sort.key === 'total' ? totalOf(gr) : sort.key === 'docNum' ? gr.docNum : String(gr[sort.key as keyof GoodsReceipt] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
