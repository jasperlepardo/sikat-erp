import type { LandedCost, LcStatus } from '../../../../mocks/landedCosts';
import type { LandedCostType } from '../../../../mocks/landedCostTypes';
import type { Partner } from '../../../../mocks/partners';
import type { GoodsReceipt } from '../../../../mocks/goodsReceipts';
import type { StatusIntent } from '../../../../components/form/fields';

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

export const LC_LIST_PATH = '/purchasing/landed-costs';

export const LC_STATUS_INTENT: Record<LcStatus, StatusIntent> = {
  Draft: 'default',
  Open: 'primary',
  Cancelled: 'danger',
};

export const LC_STATUS_HINT: Record<LcStatus, string> = {
  Draft: 'Not yet posted.',
  Open: 'Posted — costs allocated to the receipts.',
  Cancelled: 'Cancelled.',
};
