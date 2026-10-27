import type { Errors } from '../../../../components/form/fields';
import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { PrLine, PurchaseRequest } from '../../../../mocks/purchaseRequests';
import { newPrLine } from '../../../../mocks/purchaseRequests';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { LAST_PURCHASE_PRICE_LIST_ID, determinePrice } from '../../../../services/priceLists';
import { copiedQty } from '../../../../services/purchaseRequests';
import { itemsPerUom } from '../../../../mocks/items';
import { branchWarehouse } from '../../../../mocks/itemMasters';
import { branches } from '../../../../services/peopleMasters';
import { todayISO } from '../../../../services/dates';
import { rateAt } from '../../../../mocks/taxes';
import type { TaxMasterData } from '../../../../services/taxDetermination';
import type { Employee } from '../../../../mocks/employees';

export type PrDraft = Omit<PurchaseRequest, 'id'> & { id?: string };

export interface PrMasters {
  employees: Employee[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  /** Vendors (Business Partners, vendor role) — for the line's preferred-vendor lookup. */
  vendors: Partner[];
}

export type PrSectionProps = {
  draft: PrDraft;
  update: (patch: Partial<PrDraft>) => void;
  errors: Errors;
  m: PrMasters;
  ctx: PrContext;
};

export type PrTabProps = PrSectionProps;

export interface PrContext {
  rateOf: (taxCode: string) => number;
  readOnly: boolean;
  added: boolean;
  /** Some line was copied to an RFQ or PO, so the requester is locked. */
  copied: boolean;
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
    copied: draft.lines.some((l) => copiedQty(l) > 0),
  };
}

/** Proposed purchase tax code for an item at request time (no vendor known yet). */
function proposedTaxCode(item: Item, m: PrMasters): string {
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
  const qty = base.quantity ?? 1;
  return newPrLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.description || item.name,
    uomCode,
    uomName: uom?.name ?? uomCode,
    itemsPerUnit: itemsPerUom(item, uomCode) ?? 1,
    warehouse: item.inventoryItem ? branchWarehouse(branches.snapshot().find((b) => b.id === draft.branchId), m.inv.warehouses) : '',
    // Charge the line to the requester's department by default (overridable per line), like warehouse from the branch.
    departmentId: base.departmentId ?? draft.departmentId,
    unitPrice: price,
    taxCode,
    taxOverridden: false,
    quantity: qty,
    openQty: qty,
    requiredDate: draft.requiredDate,
    countryOfOriginCode: item.countryOfOriginCode, warrantyTemplateId: item.warrantyTemplate, glAccount: '',
  });
}
