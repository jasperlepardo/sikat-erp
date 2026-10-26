import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { DPR_SERIES, DPR_STATUSES, type DprStatus } from '../../../../mocks/apDownPayments';
import { formatDate } from '../../../../services/dates';
import { dprNumber } from '../../../../services/apDownPayments';
import { type DprSectionProps } from './types';
import { DPR_STATUS_INTENT } from '../../paths';

interface DprDocumentCardProps extends DprSectionProps {
  statusMoves: Partial<Record<DprStatus, () => void>>;
}

export function DprDocumentCard({ draft, update, errors, ctx, statusMoves }: DprDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="tag" title="Document">
        <FieldStack>
          {!ctx.readOnly && (
            <CtxFormField label="No.">
              {() => (
                <div className="flex gap-1">
                  <Select aria-label="Series" className="w-40" options={DPR_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                  <span className="flex-1 self-center text-sm">{draft.docNum ? dprNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
                </div>
              )}
            </CtxFormField>
          )}
          {!ctx.readOnly && (
            <StatusField statuses={DPR_STATUSES} intents={DPR_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open until drawn in full on A/P invoices, or closed by hand." error={errors.status} />
          )}
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
          {h.date('dueDate', 'Due date', { hint: 'When the vendor wants the advance, from the payment terms.' })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
