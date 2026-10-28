import { useState } from 'react';
import { Combobox, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Section } from '../../../../components/form/fields';
import { LineItemText } from '../../../../components/form/LineItemText';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import type { PurchaseRequest } from '../../../../mocks/purchaseRequests';
import type { Rfq, RfqLine } from '../../../../mocks/rfqs';
import { formatAmount } from '../../../../services/format';
import { rfqNumber } from '../../../../services/rfqs';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { awardedByPrLine, prLineFor, remainingToAward } from '../../shared/poFromRfq';
import type { Award } from './comparison';
import { PO_NOUN, RFQ_NOUN } from '../../paths';

const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));

/**
 * Create a purchase order from a quote: pick one vendor's quotation, and its quoted lines come at the quoted quantity
 * (capped at what's left to award on the request line). Create purchase order opens one purchase order for
 * review. Repeat for another vendor to split the request.
 */
export function AwardPoPanel({
  pr,
  rfqs,
  pos,
  onCancel,
  onAward,
}: {
  pr: PurchaseRequest;
  rfqs: readonly Rfq[];
  pos: readonly PurchaseOrder[];
  onCancel: () => void;
  onAward: (award: Award) => void;
}) {
  const quoting = rfqs.filter((q) => q.lines.some((l) => l.quotedQty > 0));
  const [rfqId, setRfqId] = useState(quoting[0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const awarded = awardedByPrLine(pos, pr.id);
  const rfq = quoting.find((q) => q.id === rfqId);

  const capOf = (l: RfqLine) => {
    const prLine = prLineFor(pr, l);
    return prLine ? Math.min(l.quotedQty, remainingToAward(prLine, awarded)) : 0;
  };
  const rows = (rfq?.lines ?? []).filter((l) => l.quotedQty > 0);
  const qtyOf = (l: RfqLine) => qty[l.id] ?? capOf(l);
  const lineQtys = Object.fromEntries(rows.filter((l) => qtyOf(l) > 0).map((l) => [l.id, qtyOf(l)]));

  const columns: TableColumn<RfqLine>[] = [
    { key: 'item', header: 'Item', cell: (l) => <LineItemText itemNo={l.itemNo} description={l.description} /> },
    {
      key: 'open',
      header: 'Left to award',
      align: 'end',
      cell: (l) => {
        const prLine = prLineFor(pr, l);
        return prLine ? remainingToAward(prLine, awarded) : '—';
      },
    },
    { key: 'quotedQty', header: 'Quoted', align: 'end', cell: (l) => l.quotedQty },
    { key: 'unitPrice', header: 'Unit price', align: 'end', cell: (l) => `${rfq?.currency ?? ''} ${formatAmount(l.unitPrice)}` },
    {
      key: 'award',
      header: 'Award',
      align: 'end',
      cell: (l) => (
        <TextField
          aria-label={`Award quantity of ${l.itemNo}`}
          type="number"
          min={0}
          className="w-24"
          suffix={`/ ${capOf(l)}`}
          disabled={!capOf(l)}
          value={String(qtyOf(l))}
          onChange={(e) => setQty({ ...qty, [l.id]: Math.min(capOf(l), num(e.currentTarget.value)) })}
        />
      ),
    },
  ];

  return (
    <EditPanel
      icon="shopping_cart"
      title={`Create ${PO_NOUN.one} from a quote`}
      onCancel={onCancel}
      onDone={() => rfq && onAward({ rfq, lineQtys })}
      doneLabel={`Create ${PO_NOUN.one}`}
      doneDisabled={!rfq || !Object.keys(lineQtys).length}
    >
      <Section icon="request_quote" title="Quotation">
        <Combobox
          aria-label="Vendor quotation"
          placeholder="Pick a vendor"
          options={quoting.map((q) => ({ value: q.id, label: q.vendorName, description: q.docNum ? rfqNumber(q) : `Draft ${RFQ_NOUN.one}`, text: `${q.vendorName} ${q.docNum ? rfqNumber(q) : ''}` }))}
          value={rfqId || null}
          onValueChange={(v) => {
            setRfqId(v ?? '');
            setQty({});
          }}
        />
        <Text variant="small" tone="muted">
          {quoting.length ? 'Award quantities start at what the vendor quoted, up to what is left on the request. Repeat for another vendor to split.' : 'No vendor has quoted yet.'}
        </Text>
      </Section>
      {rfq ? (
        <DataTable
          variant="card"
          icon="list_alt"
          title="Quoted lines"
          rows={rows}
          columns={columns}
          getRowId={(l) => l.id}
          unsortable={['item', 'open', 'quotedQty', 'unitPrice', 'award']}
          noPagination
          empty={<Text variant="small" tone="muted">Nothing quoted.</Text>}
        />
      ) : null}
    </EditPanel>
  );
}
