import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Currency } from '../../../../mocks/currencies';
import type { DocumentSeries } from '../../../../mocks/common';
import type { PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import type { InventoryMasters } from '../../../../services/inventoryMasters';

export type PbaDraft = Omit<PurchaseBlanketAgreement, 'id'> & { id?: string };


export interface PbaMasters {
  vendors: Partner[];
  items: Item[];
  inv: InventoryMasters;
  pbaSeries: DocumentSeries[];
  currencies: Currency[];
}
