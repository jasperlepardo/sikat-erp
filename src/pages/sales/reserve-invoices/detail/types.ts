import type { Errors } from '../../../../components/form/fields';
import { newRiLine, type RiLine } from '../../../../mocks/reserveInvoices';
import type { SalesOrder, SoLine } from '../../../../mocks/salesOrders';
import type { RiInput } from '../../../../services/reserveInvoices';
import { soNumber } from '../../../../services/salesOrders';
import { buildDnContext, type DnContext, type DnDraft, type DnMasters } from '../../deliveries/detail/types';


export type RiDraft = RiInput;

/** Reserve Invoice master data — same as delivery masters (which already include orders). */
export type RiMasters = DnMasters;

export type RiContext = DnContext;

export interface RiSectionProps {
  draft: RiDraft;
  update: (patch: Partial<RiDraft>) => void;
  errors: Errors;
  m: RiMasters;
  ctx: RiContext;
}

/** Same context as a delivery: customer, rates, fixed rate once added, based on a document. */
export const buildRiContext = (r: RiDraft, m: RiMasters): RiContext => buildDnContext(r as unknown as DnDraft, m);

/** A line copied straight from a sales order: the RI posts revenue but delivery handles stock. */
export const riLineFromOrder = (so: SalesOrder, l: SoLine, quantity: number, wtaxLiable: boolean): RiLine =>
  newRiLine({
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
    glAccount: l.glAccount,
    baseType: 'SO',
    baseId: so.id,
    baseLineId: l.id,
    baseDocNo: soNumber(so),
    baseRow: so.lines.indexOf(l) + 1,
    wtaxLiable,
    openQtyForIt: quantity,
  });

;
