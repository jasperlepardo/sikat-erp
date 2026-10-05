import type { Errors } from '../../../../components/form/fields';
import { newArLine, type ArLine } from '../../../../mocks/arInvoices';
import type { Delivery, DnLine } from '../../../../mocks/deliveries';
import type { SalesOrder, SoLine } from '../../../../mocks/salesOrders';
import type { ArInput } from '../../../../services/arInvoices';
import { dnNumber } from '../../../../services/deliveries';
import { soNumber } from '../../../../services/salesOrders';
import { buildDnContext, type DnContext, type DnDraft, type DnMasters } from '../../deliveries/detail/types';

export const AR_LIST_PATH = '/sales/invoices';

export type ArDraft = ArInput;

/** The delivery form's master data, plus the deliveries to copy from. */
export interface ArMasters extends DnMasters {
  deliveries: Delivery[];
}

export type ArContext = DnContext;

export interface ArSectionProps {
  draft: ArDraft;
  update: (patch: Partial<ArDraft>) => void;
  errors: Errors;
  m: ArMasters;
  ctx: ArContext;
}

/** Same context as a delivery: customer, rates, fixed rate once added, based on a document. */
export const buildArContext = (a: ArDraft, m: ArMasters): ArContext => buildDnContext(a as unknown as DnDraft, m);

/** A line copied from a delivery: bills what was shipped, at the delivery's price and cost. */
export const arLineFromDelivery = (d: Delivery, l: DnLine, quantity: number, wtaxLiable: boolean): ArLine =>
  newArLine({
    ...l,
    id: undefined,
    quantity,
    baseType: 'DN',
    baseId: d.id,
    baseLineId: l.id,
    baseDocNo: dnNumber(d),
    baseRow: d.lines.indexOf(l) + 1,
    shippedGoods: d.useShippedGoodsAccount,
    wtaxLiable,
  });

/** A line copied straight from a sales order: the invoice ships it too. */
export const arLineFromOrder = (so: SalesOrder, l: SoLine, quantity: number, wtaxLiable: boolean): ArLine =>
  newArLine({
    itemId: l.itemId,
    itemNo: l.itemNo,
    description: l.description,
    quantity,
    uomCode: l.uomCode,
    uomName: l.uomName,
    itemsPerUnit: l.itemsPerUnit,
    warehouse: l.warehouse,
    priceList: l.priceList,
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
  });
