import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { DocumentSeries } from '../../../../mocks/common';
import type { BlanketAgreement } from '../../../../mocks/blanketAgreements';
import type { InventoryMasters } from '../../../../services/inventoryMasters';

export type BaDraft = Omit<BlanketAgreement, 'id'> & { id?: string };


export interface BaMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  baSeries: DocumentSeries[];
}
