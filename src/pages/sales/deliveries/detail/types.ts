import type { Errors } from '../../../../components/form/fields';
import { newDnLine, type DnLine } from '../../../../mocks/deliveries';
import type { ReserveInvoice, RiLine } from '../../../../mocks/reserveInvoices';
import type { SalesOrder, SoLine } from '../../../../mocks/salesOrders';
import type { DnInput } from '../../../../services/deliveries';
import { soNumber } from '../../../../services/salesOrders';
import { buildContext, type SoContext, type SoDraft, type SoMasters } from '../../sales-orders/detail/types';


export type DnDraft = DnInput;

/** The sales order form's master data, plus the orders to copy from. */
export interface DnMasters extends SoMasters {
  orders: SalesOrder[];
}

export interface DnContext extends SoContext {
  /** Has lines copied from an order: the customer and currency are locked to it. */
  based: boolean;
}

export interface DnSectionProps {
  draft: DnDraft;
  update: (patch: Partial<DnDraft>) => void;
  errors: Errors;
  m: DnMasters;
  ctx: DnContext;
}

/**
 * The delivery read as a sales order, for the pricing and tax helpers the two share. The fields
 * they read (customer, currency, posting date, status) are the same on both.
 */
export const asSoDraft = (d: DnDraft) => ({ ...d, docType: 'Item' }) as unknown as SoDraft;

export function buildDnContext(d: DnDraft, m: DnMasters): DnContext {
  const ctx = buildContext(asSoDraft(d), m);
  const added = d.status !== 'Draft';
  return {
    ...ctx,
    // Once added, the rate is the one fixed on the delivery.
    fx: added && d.currency !== 'PHP' ? d.fxRate : ctx.fx,
    fxRate: added && d.currency !== 'PHP' ? { rate: d.fxRate, date: d.postingDate, source: '' } : ctx.fxRate,
    readOnly: added,
    added,
    based: d.lines.some((l) => l.baseId),
  };
}

/** A delivery line copied from a sales order line: its item, unit, warehouse, price and tax. */
export const dnLineFromOrder = (so: SalesOrder, l: SoLine, quantity: number): DnLine =>
  newDnLine({
    itemId: l.itemId,
    itemNo: l.itemNo,
    description: l.description,
    quantity,
    uomCode: l.uomCode,
    uomName: l.uomName,
    itemsPerUnit: l.itemsPerUnit,
    warehouse: l.warehouse,
    priceListId: l.priceListId,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    priceSource: l.priceSource,
    taxCode: l.taxCode,
    baseType: 'SO',
    baseId: so.id,
    baseLineId: l.id,
    baseDocNo: soNumber(so),
    baseRow: so.lines.indexOf(l) + 1,
  });

/**
 * A delivery line that fulfils an A/R reserve invoice. It keeps the reserve invoice's own SO base
 * (so the sales order draws down normally) and adds the reserve-invoice link (`riId`/`riLineId`) that
 * drives its open-quantity counter and the IFRS 15 revenue recognition posted with the delivery.
 */
export const dnLineFromRi = (ri: ReserveInvoice, l: RiLine, quantity: number): DnLine =>
  newDnLine({
    itemId: l.itemId,
    itemNo: l.itemNo,
    description: l.description,
    quantity,
    uomCode: l.uomCode,
    uomName: l.uomName,
    itemsPerUnit: l.itemsPerUnit,
    warehouse: l.warehouse,
    priceListId: l.priceListId,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    priceSource: l.priceSource,
    taxCode: l.taxCode,
    baseType: l.baseType,
    baseId: l.baseId,
    baseLineId: l.baseLineId,
    baseDocNo: l.baseDocNo,
    baseRow: l.baseRow,
    riId: ri.id,
    riLineId: l.id,
  });
