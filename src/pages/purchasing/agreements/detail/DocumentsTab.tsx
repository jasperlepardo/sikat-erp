import { TableLink, TableStatus, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { taxCodes } from '../../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../../services/purchaseOrders';
import { useAsync } from '../../../../services/useAsync';
import { PO_LIST_PATH, STATUS_INTENT } from '../../orders/detail/PurchaseOrderDetail';

export function DocumentsTab({ pbaId }: { pbaId: string | undefined }) {
  const data = useAsync(() => Promise.all([listPurchaseOrders(), taxCodes.list()]), []);
  const [allOrders, codes] = data ?? [undefined, []];

  if (!pbaId) {
    return (
      <Text tone="muted" variant="small" className="p-4">
        Save the agreement first to see linked documents.
      </Text>
    );
  }

  const linkedOrders = (allOrders ?? []).filter((po) =>
    po.lines.some((l) => l.agreementId === pbaId),
  );

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: 'document',
      header: 'Document',
      cell: (po) => (
        <TableLink href={`#${PO_LIST_PATH}/${po.id}`}>
          {poNumber(po)}
        </TableLink>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (po) => (
        <TableStatus intent={STATUS_INTENT[po.status]}>{po.status}</TableStatus>
      ),
    },
    {
      key: 'vendorRef',
      header: 'Vendor ref',
      cell: (po) => po.vendorRef || '—',
    },
    {
      key: 'postingDate',
      header: 'Date',
      cell: (po) => formatDate(po.postingDate),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (po) => po.lines.filter((l) => l.agreementId === pbaId).length,
    },
    {
      key: 'total',
      header: 'Total',
      cell: (po) => (
        <span className="tabular-nums">
          {po.currency} {formatAmount(poTotal(po, codes))}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      variant="card"
      noPagination
      icon="receipt_long"
      title="Linked Documents"
      rows={linkedOrders}
      getRowId={(po) => po.id}
      columns={columns}
      sortValue={(po, key) => {
        if (key === 'document') return poNumber(po);
        if (key === 'postingDate') return po.postingDate;
        if (key === 'total') return poTotal(po, codes);
        return String(po[key as keyof PurchaseOrder] ?? '');
      }}
      empty={
        allOrders ? (
          <Text variant="small" tone="muted">
            No documents linked yet. Reference this agreement on a Purchase Order line.
          </Text>
        ) : (
          <Text variant="small" tone="muted">Loading…</Text>
        )
      }
    />
  );
}
