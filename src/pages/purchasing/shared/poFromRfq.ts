import { blankPurchaseOrder, newPoLine, type PurchaseOrder } from '../../../mocks/purchaseOrders';
import type { PrLine, PurchaseRequest } from '../../../mocks/purchaseRequests';
import type { Rfq, RfqLine } from '../../../mocks/rfqs';
import { round4 } from '../../../services/num';
import type { PoInput } from '../../../services/purchaseOrders';
import { prNumber } from '../../../services/purchaseRequests';
import { rfqNumber, type RfqInput } from '../../../services/rfqs';

/** The request line a quotation line answers: its base line, else the request's line for the same item. */
export const prLineFor = (pr: Pick<PurchaseRequest, 'lines'>, l: Pick<RfqLine, 'baseLineId' | 'itemId'>): PrLine | undefined =>
  (l.baseLineId && pr.lines.find((p) => p.id === l.baseLineId)) || pr.lines.find((p) => p.itemId === l.itemId);

/**
 * How much of each request line is already on a purchase order (not cancelled), keyed by request
 * line. Draft POs count: they don't draw the request's open quantity until added, but what's on
 * them can't be awarded twice.
 */
export function awardedByPrLine(pos: readonly PurchaseOrder[], prId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const po of pos) {
    if (po.basePrId !== prId || po.status === 'Cancelled') continue;
    for (const l of po.lines) if (l.baseLineId) out.set(l.baseLineId, round4((out.get(l.baseLineId) ?? 0) + l.quantity));
  }
  return out;
}

/**
 * How much was ordered from each line of a quotation, keyed by quotation line: purchase orders
 * raised from it (added, not cancelled, like a request's drawn quantity), each PO line matched by
 * the request line both answer, else by item, in the quotation line's unit.
 */
export function orderedByRfqLine(pos: readonly PurchaseOrder[], rfq: Pick<Rfq, 'lines'> & { id?: string }): Map<string, number> {
  const out = new Map<string, number>();
  if (!rfq.id) return out;
  for (const po of pos) {
    if (po.baseRfqId !== rfq.id || po.status === 'Draft' || po.status === 'Cancelled') continue;
    for (const pl of po.lines) {
      const ql = (pl.baseLineId && rfq.lines.find((l) => l.baseLineId === pl.baseLineId)) || rfq.lines.find((l) => l.itemId === pl.itemId);
      if (!ql) continue;
      const qty = (pl.quantity * (pl.itemsPerUnit || 1)) / (ql.itemsPerUnit || 1);
      out.set(ql.id, round4((out.get(ql.id) ?? 0) + qty));
    }
  }
  return out;
}

/** What's left to award on a request line: its quantity less what POs already carry; nothing once closed. */
export const remainingToAward = (l: PrLine, awarded: ReadonlyMap<string, number>) =>
  l.status === 'Closed' ? 0 : Math.max(0, round4(l.quantity - (awarded.get(l.id) ?? 0)));

/**
 * A purchase order draft from a vendor's quotation — the award. Lines come at `lineQtys` (by
 * quotation line; zero or missing leaves the line out) or, without it, at the quoted quantity.
 * A quotation raised from a request links the PO back to it too, line by line, so adding the PO
 * draws the request down; `pr`, when given, fills each line's warehouse and required date.
 */
export function poDraftFromRfq(
  rfq: RfqInput,
  { buyerId, approved, today, lineQtys, pr }: {
    buyerId: string;
    approved: boolean;
    today: string;
    lineQtys?: Readonly<Record<string, number>>;
    pr?: PurchaseRequest;
  },
): PoInput {
  const qtyOf = (l: RfqLine) => (lineQtys ? (lineQtys[l.id] ?? 0) : l.quotedQty || l.quantity);
  const prNo = pr ? prNumber(pr) : undefined;
  return {
    ...blankPurchaseOrder(buyerId),
    approved,
    // Lineage back to the quotation and, through it, the request (the graph links PO → RFQ → PR).
    baseRfqId: rfq.id ?? '',
    basePrId: rfq.basePrId || undefined,
    vendorId: rfq.vendorId, vendorCode: rfq.vendorCode, vendorName: rfq.vendorName,
    contactId: rfq.contactId, vendorRef: rfq.vendorRef, currency: rfq.currency,
    paymentTermId: rfq.paymentTermId, paymentMethod: rfq.paymentMethod,
    shippingType: rfq.shippingType, shipTo: rfq.shipTo, projectId: rfq.projectId,
    journalRemark: rfq.journalRemark.replace('Quotations', 'Orders'),
    postingDate: today, documentDate: today,
    requiredDate: pr?.requiredDate ?? rfq.requiredDate,
    lines: rfq.lines
      .filter((l) => l.itemId && qtyOf(l) > 0)
      .map((l) => {
        const prLine = pr && rfq.basePrId === pr.id ? prLineFor(pr, l) : undefined;
        return newPoLine({
          itemId: l.itemId, itemNo: l.itemNo, name: l.description, description: l.description,
          quantity: qtyOf(l), uomCode: l.uomCode, uomName: l.uomName,
          itemsPerUnit: l.itemsPerUnit, priceListId: l.priceListId, unitPrice: l.unitPrice,
          discountPct: l.discountPct, taxCode: l.taxCode,
          agreementId: l.agreementId, agreementLineId: l.agreementLineId, requisitionSlipNo: l.requisitionSlipNo,
          countryOfOriginCode: l.countryOfOriginCode, warrantyTemplateId: l.warrantyTemplateId, glAccount: l.glAccount,
          ...(prLine ? { requiredDate: prLine.requiredDate, departmentId: prLine.departmentId } : {}),
          ...(prLine?.warehouse ? { warehouse: prLine.warehouse } : {}),
          // The request line, so the PO draws it down — the quotation itself never does.
          ...(rfq.basePrId && (prLine?.id ?? l.baseLineId)
            ? { baseId: rfq.basePrId, baseLineId: prLine?.id ?? l.baseLineId, baseDocNo: prNo ?? l.baseDocNo }
            : {}),
        });
      }),
    remarks: rfq.docNum ? `From RFQ ${rfqNumber(rfq)}.` : 'From RFQ.',
  };
}
