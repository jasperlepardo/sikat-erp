import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, ReadOnly, Section, SideFields, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { MEMO_SERIES, MEMO_STATUSES, type MemoStatus } from '../../../../mocks/apCreditMemos';
import { formatDate } from '../../../../services/dates';
import { memoNumber } from '../../../../services/apCreditMemos';
import type { CmSectionProps } from './types';
import { MEMO_STATUS_INTENT } from '../../paths';

interface CmDocumentCardProps extends CmSectionProps {
  statusMoves: Partial<Record<MemoStatus, () => void>>;
  locked: boolean;
}

export function CmDocumentCard({ draft, update, errors, statusMoves, locked }: CmDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <Section icon="tag" title="Document">
      <SideFields>
        {locked ? (
          <ReadOnly label="No." value={memoNumber(draft)} />
        ) : (
          <CtxFormField label="No.">
            {() => (
              <div className="flex gap-1">
                <Select aria-label="Series" className="min-w-0 flex-1" options={MEMO_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                <span className="shrink-0 self-center whitespace-nowrap text-sm">{draft.docNum ? memoNumber(draft) : <span className="text-placeholder">Next number</span>}</span>
              </div>
            )}
          </CtxFormField>
        )}
        <StatusField statuses={MEMO_STATUSES} intents={MEMO_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open while credit is left to apply; Closed once all of it is applied." error={errors.status} />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
        {h.date('dueDate', 'Due date', { hint: 'When the credit is due, from the payment terms.' })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: "The date on the vendor's credit note." })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
      </SideFields>
    </Section>
  );
}
