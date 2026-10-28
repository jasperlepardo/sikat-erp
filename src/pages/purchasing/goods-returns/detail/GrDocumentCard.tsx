import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, ReadOnly, Section, SideFields, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { RETURN_SERIES, RETURN_STATUSES, type ReturnStatus } from '../../../../mocks/goodsReturns';
import { formatDate } from '../../../../services/dates';
import { returnNumber } from '../../../../services/goodsReturns';
import type { GrSectionProps } from './types';
import { RETURN_STATUS_INTENT } from '../../paths';

interface GrDocumentCardProps extends GrSectionProps {
  statusMoves: Partial<Record<ReturnStatus, () => void>>;
  locked: boolean;
}

export function GrDocumentCard({ draft, update, errors, statusMoves, locked }: GrDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <Section icon="tag" title="Document">
      <SideFields>
        {locked ? (
          <ReadOnly label="No." value={returnNumber(draft)} />
        ) : (
          <CtxFormField label="No.">
            {() => (
              <div className="flex gap-1">
                <Select aria-label="Series" className="min-w-0 flex-1" options={RETURN_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                <span className="shrink-0 self-center whitespace-nowrap text-sm">{draft.docNum ? returnNumber(draft) : <span className="text-placeholder">Next number</span>}</span>
              </div>
            )}
          </CtxFormField>
        )}
        <StatusField statuses={RETURN_STATUSES} intents={RETURN_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open while billed goods wait for a credit memo; Closed once credited (or straight away for unbilled goods)." error={errors.status} />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the stock leaves.' })}
        {h.date('dueDate', 'Due date', { hint: "When the vendor's credit is due, from the payment terms." })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
      </SideFields>
    </Section>
  );
}
