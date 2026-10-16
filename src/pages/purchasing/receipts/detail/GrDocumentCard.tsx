import { FormField, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { GR_SERIES, GR_STATUSES, type GrStatus } from '../../../../mocks/goodsReceipts';
import { formatDate } from '../../../../services/dates';
import { grNumber } from '../../../../services/goodsReceipts';
import { GR_STATUS_INTENT, type GrSectionProps } from './types';

interface GrDocumentCardProps extends GrSectionProps {
  statusMoves: Partial<Record<GrStatus, () => void>>;
}

export function GrDocumentCard({ draft, update, errors, ctx, statusMoves }: GrDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="tag" title="Document">
        <Fields>
          <FormField label="No." tooltip={ctx.readOnly ? undefined : 'Assigned from the series when the receipt is added.'}>
            {() => (
              <div className="flex gap-1">
                <Select aria-label="Series" className="w-40" disabled={ctx.readOnly} options={GR_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                <span className="flex-1 self-center text-sm">{draft.docNum ? grNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
              </div>
            )}
          </FormField>
          <StatusField statuses={GR_STATUSES} intents={GR_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open once added; Closed when invoiced (or closed by hand); Cancelled when reversed." error={errors.status} />
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the stock is recorded. Sets the exchange rate, tax rates and period.' })}
          {h.date('dueDate', 'Due date', { error: errors.dueDate, hint: 'Posting date + the payment terms. The A/P invoice takes it.' })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: "The date on the vendor's delivery receipt. Defaults to today." })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the receipt is closed or cancelled." />
        </Fields>
      </Section>
    </fieldset>
  );
}
