import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import { newDiLine, type DiLine } from '../../../../mocks/arDownPaymentInvoices';
import type { SalesOrder, SoLine } from '../../../../mocks/salesOrders';
import type { DiInput } from '../../../../services/arDownPaymentInvoices';
import { soNumber } from '../../../../services/salesOrders';
import { buildDnContext, type DnContext, type DnDraft, type DnMasters } from '../../deliveries/detail/types';

export type DiDraft = DiInput;

/** A/R down payment invoice master data — delivery masters (which include orders) plus the chart of accounts. */
export interface DiMasters extends DnMasters {
  orders: SalesOrder[];
  accounts: Account[];
}

export type DiContext = DnContext;

export interface DiSectionProps {
  draft: DiDraft;
  update: (patch: Partial<DiDraft>) => void;
  errors: Errors;
  m: DiMasters;
  ctx: DiContext;
}

/** Same context as a delivery: customer, rates, fixed rate once added, based on a document. */
export const buildDiContext = (d: DiDraft, m: DiMasters): DiContext =>
  buildDnContext(d as unknown as DnDraft, m);

/** A line copied straight from a sales order: the advance is figured on it; the order isn't drawn down. */
export const diLineFromOrder = (so: SalesOrder, l: SoLine, quantity: number): DiLine =>
  newDiLine({
    itemId: l.itemId,
    itemNo: l.itemNo,
    description: l.description,
    quantity,
    uomCode: l.uomCode,
    uomName: l.uomName,
    itemsPerUnit: l.itemsPerUnit,
    warehouse: '',
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
  });
