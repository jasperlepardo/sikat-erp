import type { Errors } from '../../../../components/form/fields';
import type { GoodsReturnRequest, GrrLine, GrrStatus } from '../../../../mocks/goodsReturnRequests';
import type { Currency } from '../../../../mocks/currencies';
import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import type { TaxMasterData } from '../../../../services/taxDetermination';

export type GrrDraft = Omit<GoodsReturnRequest, 'id'> & { id?: string };

export interface GrrMasters {
  vendors: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
}

export interface GrrSectionProps {
  draft: GrrDraft;
  update: (patch: Partial<GrrDraft>) => void;
  errors: Errors;
  m: GrrMasters;
}

export interface GrrContext {
  readOnly: boolean;
  added: boolean;
}

export function buildGrrContext(draft: GrrDraft): GrrContext {
  return {
    readOnly: draft.status === 'Closed',
    added: draft.docNum > 0,
  };
}

/** @public */
export type { GrrLine, GrrStatus };
