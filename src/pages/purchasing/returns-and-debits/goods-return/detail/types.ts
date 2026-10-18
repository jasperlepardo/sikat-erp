import type { Errors } from '../../../../../components/form/fields';
import type { GoodsReturn } from '../../../../../mocks/goodsReturns';
import type { RetMasters, RetContext } from '../../types';

export type GrDraft = Omit<GoodsReturn, 'id'> & { id?: string };
export type TabId = 'contents' | 'logistics' | 'accounting';

export interface GrSectionProps {
  draft: GrDraft;
  update: (patch: Partial<GrDraft>) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
}
