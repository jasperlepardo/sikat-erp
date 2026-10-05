import { useState } from 'react';
import { Section } from '../../../../components/form/fields';
import { Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { ADVANCES_TO_SUPPLIERS, type DownPaymentRequest } from '../../../../mocks/apDownPayments';
import type { DownPaymentDraw } from '../../../../mocks/apInvoices';
import { dprNumber, drawableAmount, paidRate } from '../../../../services/apDownPayments';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { EditPanel } from '../../../partners/detail/EditPanel';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Total Down Payment › draw: pick the paid down payment requests this invoice settles, and how
 * much of each. Proposed: oldest first, up to what's paid and undrawn and what the invoice owes.
 */
export function DrawPanel({
  code,
  requests,
  current,
  max,
  onCancel,
  onDone,
}: {
  code: string;
  requests: DownPaymentRequest[];
  current: DownPaymentDraw[];
  /** The invoice's net payment due before down payments: the most that can be drawn. */
  max: number;
  onCancel: () => void;
  onDone: (draws: DownPaymentDraw[]) => void;
}) {
  // What each request can give this invoice: paid and undrawn, plus what this draft already drew.
  const available = (d: DownPaymentRequest) => round2(drawableAmount(d) + (current.find((c) => c.requestId === d.id)?.amount ?? 0));
  const sorted = [...requests].sort((a, b) => a.postingDate.localeCompare(b.postingDate));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    if (current.length) return Object.fromEntries(current.map((c) => [c.requestId, c.amount]));
    let left = max;
    return Object.fromEntries(
      sorted.map((d) => {
        const a = round2(Math.min(left, available(d)));
        left = round2(left - a);
        return [d.id, a];
      }),
    );
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));
  const tooMuch = total > max + 0.005;

  const columns: TableColumn<DownPaymentRequest>[] = [
    { key: 'docNo', header: 'Down payment request', cell: (d) => <div className="flex flex-col"><span>{dprNumber(d)}</span><Text variant="small" tone="muted">{d.orderNumber ? `PO ${d.orderNumber}` : 'Without PO'}</Text></div> },
    { key: 'postingDate', header: 'Date', cell: (d) => formatDate(d.postingDate) },
    { key: 'paid', header: 'Paid', cell: (d) => <span className="tabular-nums">{formatAmount(d.appliedAmount)}</span> },
    { key: 'available', header: 'Can draw', cell: (d) => <span className="tabular-nums">{formatAmount(available(d))}</span> },
    {
      key: 'amount',
      header: `Draw (${code})`,
      cell: (d) => (
        <TextField aria-label={`Draw from ${dprNumber(d)}`} type="number" min={0} className="w-36" value={String(amounts[d.id] ?? 0)} onChange={(e) => setAmounts({ ...amounts, [d.id]: Math.min(available(d), Number(e.currentTarget.value) || 0) })} />
      ),
    },
  ];

  return (
    <EditPanel
      icon="savings"
      title="Draw down payments"
      onCancel={onCancel}
      onDone={() =>
        tooMuch
          ? undefined
          : onDone(
              sorted
                .filter((d) => (amounts[d.id] ?? 0) > 0)
                .map((d) => ({ requestId: d.id, docNo: dprNumber(d), amount: amounts[d.id], amountLc: round2(amounts[d.id] * paidRate(d)), account: d.downPaymentAccount || ADVANCES_TO_SUPPLIERS })),
            )
      }
    >
      <Section icon="savings" title={`Drawing ${code} ${formatAmount(total)}`}>
        <Text variant="small" tone={tooMuch ? 'danger' : 'muted'}>
          {tooMuch
            ? `More than the ${code} ${formatAmount(max)} this invoice owes.`
            : 'Paid advances only. What’s drawn comes off the net payment due and clears the advance account at the rate it was paid at.'}
        </Text>
      </Section>
      <DataTable icon="savings" title="Paid down payment requests" rows={sorted} getRowId={(d) => d.id} columns={columns} unsortable={columns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No paid down payments to draw.</Text>} />
    </EditPanel>
  );
}
