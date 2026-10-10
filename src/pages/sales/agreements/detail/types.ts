import type { Errors } from '../../../../components/form/fields';
import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { DocumentSeries } from '../../../../mocks/common';
import type { BlanketAgreement } from '../../../../mocks/blanketAgreements';
import type { InventoryMasters } from '../../../../services/inventoryMasters';

export type BaDraft = Omit<BlanketAgreement, 'id'> & { id?: string };

export const BA_LIST_PATH = '/sales/agreements';

export interface BaMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  baSeries: DocumentSeries[];
}

export interface BaTabProps {
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  errors: Errors;
  m: BaMasters;
  readOnly: boolean;
}
