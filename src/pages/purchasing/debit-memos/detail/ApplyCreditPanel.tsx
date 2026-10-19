import { useState } from 'react';
import { Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Section } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { EditPanel } from '../../../partners/detail/EditPanel';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Copy To › A/P Invoice: put credit left on the memo against the vendor's open invoices, oldest due first. */
export function ApplyCreditPanel({
  code,
  open,
  invoices,
  onCancel,
  onDone,
}: {
  code: string;
  open: number;
  invoices: { id: string; docNo: string; dueDate: string; balance: number; total: number }[];
  onCancel: () => void;
  onDone: (picks: { invoiceId: string; docNo: string; amount: number; total: number }[]) => void;
}) {
  const sorted = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    let left = open;
    return Object.fromEntries(sorted.map((i) => {
      const a = round2(Math.min(left, i.balance));
      left = round2(left - a);
      return [i.id, a];
    }));
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));
  const columns: TableColumn<(typeof sorted)[number]>[] = [
    { key: 'docNo', header: 'A/P invoice', cell: (i) => i.docNo },
    { key: 'dueDate', header: 'Due', cell: (i) => formatDate(i.dueDate) },
    { key: 'balance', header: 'Balance due', cell: (i) => formatAmount(i.balance) },
    {
      key: 'amount',
      header: `Apply (${code})`,
      cell: (i) => (
        <TextField aria-label={`Apply to ${i.docNo}`} type="number" min={0} className="w-36" value={String(amounts[i.id] ?? 0)} onChange={(e) => setAmounts({ ...amounts, [i.id]: Math.min(i.balance, Number(e.currentTarget.value) || 0) })} />
      ),
    },
  ];
  return (
    <EditPanel icon="request_quote" title="Apply credit to invoices" onCancel={onCancel} onDone={() => (total > 0 && total <= open + 0.005 ? onDone(sorted.filter((i) => amounts[i.id] > 0).map((i) => ({ invoiceId: i.id, docNo: i.docNo, amount: amounts[i.id], total: i.total }))) : onCancel())}>
      <Section icon="savings" title={`${code} ${formatAmount(open)} of credit to apply`}>
        <Text variant="small" tone={total > open + 0.005 ? 'danger' : 'muted'}>
          Applying {code} {formatAmount(total)}{total > open + 0.005 ? ' — more than the credit left.' : ". Each invoice's balance due drops by what's applied."}
        </Text>
      </Section>
      <DataTable icon="receipt_long" title="Open A/P invoices" rows={sorted} getRowId={(i) => i.id} columns={columns} unsortable={columns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No open invoices in {code}.</Text>} />
    </EditPanel>
  );
}
