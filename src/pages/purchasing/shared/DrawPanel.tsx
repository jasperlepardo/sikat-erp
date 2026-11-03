import { useState } from 'react';
import { Section } from '../../../components/form/fields';
import { Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { DownPaymentDraw } from '../../../mocks/apInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { EditPanel } from '../../partners/detail/EditPanel';
import { round2 } from '../../../services/num';

/** A paid advance (down payment request or invoice) this bill can draw, and how to stamp the draw. */
export interface DrawableAdvance {
  id: string;
  docNo: string;
  postingDate: string;
  orderNumber?: string;
  /** Gross drawable in the document currency, excluding what this draft already drew. */
  available: number;
  /** Build the stamped draw for a chosen gross amount — a DPI carries its EWT/VAT, a request doesn't. */
  toDraw: (amount: number) => DownPaymentDraw;
}

/**
 * Total Down Payment › draw: pick the paid down payments this invoice settles, and how much of each.
 * Proposed: oldest first, up to what's paid and undrawn and what the invoice owes. A down payment
 * *invoice* carries the EWT and input VAT it already recognized, so the final bill takes only the rest.
 */
export function DrawPanel({
  code,
  advances,
  current,
  max,
  onCancel,
  onDone,
}: {
  code: string;
  advances: DrawableAdvance[];
  current: DownPaymentDraw[];
  /** The invoice's net payment due before down payments: the most that can be drawn. */
  max: number;
  onCancel: () => void;
  onDone: (draws: DownPaymentDraw[]) => void;
}) {
  // What each advance can give this invoice: paid and undrawn, plus what this draft already drew.
  const available = (a: DrawableAdvance) => round2(a.available + (current.find((c) => c.requestId === a.id)?.amount ?? 0));
  const sorted = [...advances].sort((a, b) => a.postingDate.localeCompare(b.postingDate));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    if (current.length) return Object.fromEntries(current.map((c) => [c.requestId, c.amount]));
    let left = max;
    return Object.fromEntries(
      sorted.map((a) => {
        const amount = round2(Math.min(left, available(a)));
        left = round2(left - amount);
        return [a.id, amount];
      }),
    );
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));
  const tooMuch = total > max + 0.005;

  const columns: TableColumn<DrawableAdvance>[] = [
    { key: 'docNo', header: 'Down payment', cell: (a) => <div className="flex flex-col"><span>{a.docNo}</span><Text variant="small" tone="muted">{a.orderNumber ? `${a.orderNumber}` : 'Without PO'}</Text></div> },
    { key: 'postingDate', header: 'Date', align: 'end', cell: (a) => formatDate(a.postingDate) },
    { key: 'available', header: 'Can draw', cell: (a) => <span className="tabular-nums">{formatAmount(available(a))}</span> },
    {
      key: 'amount',
      header: `Draw (${code})`,
      cell: (a) => (
        <TextField aria-label={`Draw from ${a.docNo}`} type="number" min={0} className="w-36" value={String(amounts[a.id] ?? 0)} onChange={(e) => setAmounts({ ...amounts, [a.id]: Math.min(available(a), Number(e.currentTarget.value) || 0) })} />
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
          : onDone(sorted.filter((a) => (amounts[a.id] ?? 0) > 0).map((a) => a.toDraw(amounts[a.id])))
      }
    >
      <Section icon="savings" title={`Drawing ${code} ${formatAmount(total)}`}>
        <Text variant="small" tone={tooMuch ? 'danger' : 'muted'}>
          {tooMuch
            ? `More than the ${code} ${formatAmount(max)} this invoice owes.`
            : 'Paid advances only. What\'s drawn comes off the net payment due and clears the advance account; an invoiced down payment also carries its EWT and input VAT, so this bill takes only the rest.'}
        </Text>
      </Section>
      <DataTable icon="savings" title="Paid down payments" rows={sorted} getRowId={(a) => a.id} columns={columns} unsortable={columns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No paid down payments to draw.</Text>} />
    </EditPanel>
  );
}
