import { Select, TextField } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { StatusField } from '../../../../components/form/StatusField';
import { PR_STATUSES, type PrStatus, type PurchaseRequest } from '../../../../mocks/purchaseRequests';
import { prNumber, prSeries, seriesOf } from '../../../../services/purchaseRequests';
import type { PrSectionProps } from './types';

export const PR_STATUS_INTENT: Record<PrStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Open: 'primary',
  Closed: 'success',
};

const STATUS_HINT: Record<PrStatus, string> = {
  Open: 'Active request — items still needed.',
  Closed: 'All items fulfilled or request cancelled.',
};

interface PrDocumentCardProps extends PrSectionProps {
  transitions: Partial<Record<PrStatus, () => void>>;
}

export function PrDocumentCard({ draft, update, errors, ctx, transitions }: PrDocumentCardProps) {
  const h = bind(draft, update);
  const series = seriesOf(draft.seriesId);

  return (
    <Section icon="tag" title="Document">
      <FieldStack>
        <CtxFormField
          label="No."
          required
          error={errors.docNum}
          tooltip={ctx.added ? undefined : series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the request is added.'}
        >
          {(p) => (
            <div className="flex gap-1">
              <Select
                aria-label="Series"
                className="w-40"
                disabled={ctx.added}
                options={prSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                value={draft.seriesId}
                onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
              />
              {series.manual && !ctx.added ? (
                <TextField {...p} className="flex-1" type="number" placeholder="Request number" value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) })} />
              ) : (
                <span className="flex-1 self-center text-sm">
                  {draft.docNum ? prNumber(draft as PurchaseRequest) : <span className="text-(--color-text-placeholder)">Next number</span>}
                </span>
              )}
            </div>
          )}
        </CtxFormField>
        <StatusField statuses={PR_STATUSES} intents={PR_STATUS_INTENT} value={draft.status} moves={transitions} hint={STATUS_HINT[draft.status]} error={errors.status} />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'Defaults to today.' })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'The date for records. Defaults to today.' })}
        {h.date('requiredDate', 'Required date', { hint: 'When the items or services are needed. Cascades to new lines.' })}
        {h.date('validUntil', 'Valid until', { hint: 'Date the request lapses if unfulfilled.' })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the request is closed." />
      </FieldStack>
    </Section>
  );
}
