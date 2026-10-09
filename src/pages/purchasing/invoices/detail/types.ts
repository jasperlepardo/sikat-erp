import type { Errors } from '../../../../components/form/fields';
import { newApLine, type ApLine } from '../../../../mocks/apInvoices';
import type { GoodsReceipt, GrLine } from '../../../../mocks/goodsReceipts';
import type { Item } from '../../../../mocks/items';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { DownPaymentRequest } from '../../../../mocks/apDownPayments';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import type { ApInput } from '../../../../services/apInvoices';
import { grNumber, grOpenQty } from '../../../../services/goodsReceipts';
import type { GrContext, GrMasters } from '../../receipts/detail/types';

export type ApDraft = ApInput;

/** Master data the invoice form reads: the receipt form's, plus receipts to copy from and the chart. */
export interface ApMasters extends GrMasters {
  receipts: GoodsReceipt[];
  accounts: Account[];
  downPayments: DownPaymentRequest[];
}

export type ApContext = GrContext;

export interface ApSectionProps {
  draft: ApDraft;
  update: (patch: Partial<ApDraft>) => void;
  errors: Errors;
  m: ApMasters;
  ctx: ApContext;
}

/** The item's vendor catalog number and country of origin, which invoice lines show. */
const itemExtras = (item: Item | undefined, vendorId: string) => ({
  bpCatalogNo: item?.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '',
  countryOfOriginCode: item?.countryOfOriginCode ?? '',
});

/** A receipt/PO-shaped line as an invoice line. */
export function toApLine(l: GrLine, patch: Partial<ApLine>, items: Item[], vendorId: string): ApLine {
  const { invoicedQty: _billed, ...line } = l;
  return newApLine({ ...line, ...itemExtras(items.find((i) => i.id === l.itemId), vendorId), ...patch });
}

/** Invoice lines billing receipt lines, each `qty` (defaults to what's left to invoice). */
export function linesFromReceipt(gr: GoodsReceipt, picks: { lineId: string; qty: number }[], items: Item[]): ApLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const gl = gr.lines.find((l) => l.id === lineId);
    if (!gl) return [];
    return [
      toApLine(
        gl,
        {
          id: newApLine().id,
          quantity: Math.min(qty, grOpenQty(gl, gr)),
          baseType: 'GRPO',
          baseId: gr.id,
          baseLineId: gl.id,
          baseDocNo: grNumber(gr),
          receiptCostLc: gl.unitCostLc,
        },
        items,
        gr.vendorId,
      ),
    ];
  });
}

/** The PO numbers behind a set of invoice lines, for Order Number. */
export function orderNumbersOf(lines: ApLine[], m: ApMasters) {
  const out = new Set<string>();
  for (const l of lines) {
    if (l.baseType === 'PO') out.add(l.baseDocNo);
    if (l.baseType === 'GRPO') {
      const gr = m.receipts.find((r) => r.id === l.baseId);
      gr?.lines.filter((x) => x.id === l.baseLineId && x.baseDocNo).forEach((x) => out.add(x.baseDocNo));
    }
  }
  return [...out].join(', ');
}

/** Where a copied line came from, for the base document column: the receipt's or PO's own page. */
export const baseHref = (l: ApLine) =>
  l.baseType === 'GRPO' ? `#/purchasing/goods-receipts/${l.baseId}` : l.baseType === 'PO' ? `#/purchasing/purchase-orders/${l.baseId}` : '';

export type { PurchaseOrder };
