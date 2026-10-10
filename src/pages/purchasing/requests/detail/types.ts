import type { Errors } from '../../../../components/form/fields';
import type { Item } from '../../../../mocks/items';
import type { PrLine, PurchaseRequest } from '../../../../mocks/purchaseRequests';
import { newPrLine } from '../../../../mocks/purchaseRequests';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { LAST_PURCHASE_PRICE_LIST_ID, determinePrice } from '../../../../services/priceLists';
import { itemsPerUom } from '../../../../mocks/items';
import { todayISO } from '../../../../services/dates';
import { rateAt } from '../../../../mocks/taxes';
import type { TaxMasterData } from '../../../../services/taxDetermination';
import type { NamedEntry } from '../../../../mocks/partnerMasters';

export type PrDraft = Omit<PurchaseRequest, 'id'> & { id?: string };

export interface PrMasters {
  employees: NamedEntry[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
}

export interface PrTabProps {
  draft: PrDraft;
  update: (patch: Partial<PrDraft>) => void;
  errors: Errors;
  m: PrMasters;
  ctx: PrContext;
}

export interface PrContext {
  rateOf: (taxCode: string) => number;
  readOnly: boolean;
  added: boolean;
}

export function buildContext(draft: PrDraft, m: PrMasters): PrContext {
  const date = draft.postingDate || todayISO();
  return {
    rateOf: (code) => {
      const c = m.tax.codes.find((x) => x.code === code);
      return c ? (rateAt(c, date) ?? 0) : 0;
    },
    readOnly: draft.status === 'Closed',
    added: draft.docNum > 0,
  };
}

/** Proposed purchase tax code for an item at request time (no vendor known yet). */
export function proposedTaxCode(item: Item, m: PrMasters): string {
  if (item.purchaseTaxCode) return item.purchaseTaxCode;
  const group = m.tax.groups.find((g) => g.code === item.purchaseTaxGroup);
  return group?.taxCode ?? '';
}

/** Reference price from the last-purchase price list. */
export function infoPrice(item: Item, uomCode: string, date: string): number {
  const p = determinePrice({ item, partner: undefined, priceListId: LAST_PURCHASE_PRICE_LIST_ID, uom: uomCode, quantity: 1, date });
  return p.price;
}

/** A new line pre-filled from the item master. */
export function lineFromItem(item: Item, draft: PrDraft, m: PrMasters, base: Partial<PrLine> = {}): PrLine {
  const uomCode = item.purchasingUom ?? item.inventoryUom ?? 'pc';
  const uom = m.inv.uoms.find((u) => u.code === uomCode);
  const price = infoPrice(item, uomCode, draft.postingDate);
  const taxCode = proposedTaxCode(item, m);
  const qty = base.requiredQty ?? 1;
  return newPrLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    itemDescription: item.description || item.name,
    uomCode,
    uomName: uom?.name ?? uomCode,
    itemsPerUnit: itemsPerUom(item, uomCode) ?? 1,
    warehouse: item.inventoryItem ? (m.inv.warehouses[0]?.code ?? '') : '',
    infoPrice: price,
    taxCode,
    requiredQty: qty,
    openQty: qty,
    requiredDate: draft.requiredDate,
  });
}
