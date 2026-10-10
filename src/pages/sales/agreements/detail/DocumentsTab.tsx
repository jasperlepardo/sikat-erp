import { TableLink, TableStatus, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { type SalesOrder } from '../../../../mocks/salesOrders';
import { formatDate } from '../../../../services/dates';
import { taxCodes } from '../../../../services/masterData';
import { listSalesOrders, soNumber, soTotal } from '../../../../services/salesOrders';
import { useAsync } from '../../../../services/useAsync';
import { SO_LIST_PATH } from '../../orders/detail/types';
import { SO_STATUS_INTENT } from '../../orders/detail/SalesOrderDetail';

export function DocumentsTab({ baId }: { baId: string | undefined }) {
  const data = useAsync(() => Promise.all([listSalesOrders(), taxCodes.list()]), []);
  const [allOrders, codes] = data ?? [undefined, []];

  if (!baId) {
    return (
      <Text tone="muted" variant="small" className="p-4">
        Save the agreement first to see linked documents.
      </Text>
    );
  }

  const linkedOrders = (allOrders ?? []).filter((so) =>
    so.lines.some((l) => l.agreementId === baId),
  );

  const columns: TableColumn<SalesOrder>[] = [
    {
      key: 'document',
      header: 'Document',
      cell: (so) => (
        <TableLink href={`#${SO_LIST_PATH}/${soNumber(so)}`}>
          {soNumber(so)}
        </TableLink>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (so) => (
        <TableStatus intent={SO_STATUS_INTENT[so.status]}>{so.status}</TableStatus>
      ),
    },
    {
      key: 'customerRef',
      header: 'Customer ref',
      cell: (so) => so.customerRef || '—',
    },
    {
      key: 'postingDate',
      header: 'Date',
      cell: (so) => formatDate(so.postingDate),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (so) => so.lines.filter((l) => l.agreementId === baId).length,
    },
    {
      key: 'total',
      header: 'Total',
      cell: (so) => (
        <span className="tabular-nums">
          {so.currency} {so.currency === 'PHP' ? soTotal(so, codes) : '—'}
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
      getRowId={(so) => so.id}
      columns={columns}
      sortValue={(so, key) => {
        if (key === 'document') return soNumber(so);
        if (key === 'postingDate') return so.postingDate;
        if (key === 'total') return soTotal(so, codes);
        return String(so[key as keyof SalesOrder] ?? '');
      }}
      empty={
        allOrders ? (
          <Text variant="small" tone="muted">
            No documents linked yet. Reference this agreement on a Sales Order line.
          </Text>
        ) : (
          <Text variant="small" tone="muted">Loading…</Text>
        )
      }
    />
  );
}
