import type { Errors } from '../../../../components/form/fields';
import type { ApCreditMemo } from '../../../../mocks/apCreditMemos';
import type { RetMasters, RetContext } from '../../shared/returnsTypes';

type CmDraft = Omit<ApCreditMemo, 'id'> & { id?: string };

export interface CmSectionProps {
  draft: CmDraft;
  update: (patch: Partial<CmDraft>) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
}
