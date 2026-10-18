import { type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { installmentSchedule } from '../../../../services/arInvoices';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { termDays } from '../../../../services/purchaseOrders';
import type { ArSectionProps } from './types';

export function ArInstallmentsCard({ draft, balance }: Pick<ArSectionProps, 'draft'> & { balance: number }) {
  if (draft.installments <= 1) return null;
  const schedule = installmentSchedule(draft.dueDate, draft.installments, balance, termDays(draft.paymentTermId));
  const columns: TableColumn<(typeof schedule)[number]>[] = [
    { key: 'no', header: 'Installment', cell: (r) => String(r.no) },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    { key: 'amount', header: 'Amount', align: 'end', cell: (r) => `${draft.currency} ${formatAmount(r.amount)}` },
  ];
  return (
    <DataTable
      variant="card"
      icon="calendar_month"
      title="Installments"
      description={`Balance due ${draft.currency} ${formatAmount(balance)} in ${schedule.length} parts.`}
      rows={schedule}
      getRowId={(r) => String(r.no)}
      columns={columns}
      unsortable={['no', 'dueDate', 'amount']}
      noPagination
      empty={null}
    />
  );
}
