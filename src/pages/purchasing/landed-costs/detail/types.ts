import type { LandedCost, LcStatus } from '../../../../mocks/landedCosts';
import type { LandedCostType } from '../../../../mocks/landedCostTypes';
import type { Partner } from '../../../../mocks/partners';
import type { GoodsReceipt } from '../../../../mocks/goodsReceipts';

export type LcDraft = Omit<LandedCost, 'id'> & { id?: string };

export interface LcMasters {
  vendors: Partner[];
  lcTypes: LandedCostType[];
  receipts: GoodsReceipt[];
}

export interface LcSectionProps {
  draft: LcDraft;
  update: (patch: Partial<LcDraft>) => void;
  errors: Record<string, string>;
  m: LcMasters;
  readOnly: boolean;
}



export const LC_STATUS_HINT: Record<LcStatus, string> = {
  Draft: 'Not yet posted.',
  Open: 'Posted — costs allocated to the receipts.',
  Cancelled: 'Cancelled.',
};
