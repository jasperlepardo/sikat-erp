import type { Errors } from '../../../../components/form/fields';
import type { GoodsReturn } from '../../../../mocks/goodsReturns';
import type { RetMasters, RetContext } from '../../shared/returnsTypes';

type GrDraft = Omit<GoodsReturn, 'id'> & { id?: string };

export interface GrSectionProps {
  draft: GrDraft;
  update: (patch: Partial<GrDraft>) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
}
