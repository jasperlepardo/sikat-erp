import { FormField, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { LC_SERIES, LC_STATUSES, type LcStatus } from '../../../../mocks/landedCosts';
import { lcNumber } from '../../../../services/landedCosts';
import { LC_STATUS_INTENT, LC_STATUS_HINT } from './types';
import type { LcSectionProps } from './types';

interface LcDocumentCardProps extends LcSectionProps {
  statusMoves: Partial<Record<LcStatus, () => void>>;
}

export function LcDocumentCard({ draft, update, errors, statusMoves, readOnly }: LcDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <Section icon="tag" title="Document">
      <Fields>
        <FormField label="No.">
          {() => (
            <div className="flex gap-1">
              <Select
                aria-label="Series"
                className="w-40"
                disabled={readOnly}
                options={LC_SERIES.map((s) => ({ value: s.id, label: s.name }))}
                value={draft.seriesId}
                onValueChange={(seriesId) => update({ seriesId })}
              />
              <span className="flex-1 self-center text-sm">
                {draft.docNum ? lcNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}
              </span>
            </div>
          )}
        </FormField>
        <StatusField
          statuses={LC_STATUSES}
          intents={LC_STATUS_INTENT}
          value={draft.status}
          moves={statusMoves}
          hint={LC_STATUS_HINT[draft.status]}
          error={errors.status}
        />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, disabled: readOnly })}
        {h.date('dueDate', 'Due date', { disabled: readOnly })}
        {h.text('journalRemark', 'Journal remark', { disabled: readOnly })}
        {h.text('remarks', 'Remarks', { disabled: readOnly })}
      </Fields>
    </Section>
  );
}
