import type { Errors } from '../../../../components/form/fields';
import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { DocumentSeries } from '../../../../mocks/common';
import type { PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import type { InventoryMasters } from '../../../../services/inventoryMasters';

export type PbaDraft = Omit<PurchaseBlanketAgreement, 'id'> & { id?: string };

export const PBA_LIST_PATH = '/purchasing/agreements';

export interface PbaMasters {
  vendors: Partner[];
  items: Item[];
  inv: InventoryMasters;
  pbaSeries: DocumentSeries[];
}

export interface PbaTabProps {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  errors: Errors;
  m: PbaMasters;
  readOnly: boolean;
}
