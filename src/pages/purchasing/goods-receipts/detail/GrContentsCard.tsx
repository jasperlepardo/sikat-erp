import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type GrLine } from '../../../../mocks/goodsReceipts';
import { type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { openQty, poNumber } from '../../../../services/purchaseOrders';
import { receivablePos } from '../../../../services/goodsReceipts';
import { CopyPanel, type CopySourceType } from '../../shared/CopyPanel';
import { PurchDoc } from '../../shared/PurchDoc';
import { grDoc } from './grDoc';
import { linesFromPo, type GrSectionProps } from './types';

/**
 * Goods Receipt contents: the shared <PurchDoc> driven by `grDoc`, plus the
 * GR-only Copy-from-PO flow (the toolbar button lives in the doc header; the
 * panel's open state and portal live here).
 */
export function GrContents({ draft, update, errors, m, ctx, onCopy }: GrSectionProps & { onCopy: (po: PurchaseOrder, lines: GrLine[]) => void }) {
  const [copying, setCopying] = useState(false);
  const copyable = draft.vendorId ? receivablePos(m.orders, draft.vendorId).filter((po) => !ctx.based || po.currency === draft.currency) : [];

  return (
    <>
      <PurchDoc {...grDoc({ draft, update, errors, m, ctx, onCopyClick: () => setCopying(true), copyableCount: copyable.length })} />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'PO' as const,
                label: 'Purchase orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Receive',
                hint: 'Receive quantities can be at most the PO open qty.',
                docs: copyable.map((po) => ({
                  id: po.id,
                  label: `${poNumber(po)} · ${po.vendorName}`,
                  description: po.postingDate,
                  lines: po.lines
                    .filter((l) => l.status === 'Open' && openQty(l) > 0)
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }] satisfies CopySourceType<'PO'>[]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type: 'PO', docId: string, picks: { lineId: string; qty: number }[]) => {
                const po = copyable.find((p) => p.id === docId);
                setCopying(false);
                if (po) onCopy(po, linesFromPo(po, picks, m));
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
