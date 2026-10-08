import type { Errors } from '../../../../components/form/fields';
import { newDnLine, type DnLine } from '../../../../mocks/deliveries';
import type { SalesOrder, SoLine } from '../../../../mocks/salesOrders';
import type { DnInput } from '../../../../services/deliveries';
import { soNumber } from '../../../../services/salesOrders';
import { buildContext, type SoContext, type SoDraft, type SoMasters } from '../../orders/detail/types';

export const DN_LIST_PATH = '/sales/deliveries';

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
