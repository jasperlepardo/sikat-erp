import { DatePicker, FormField, Select, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { RFQ_STATUSES, type RfqStatus } from '../../../../mocks/rfqs';
import { todayISO } from '../../../../services/dates';
import { rfqNumber, rfqSeries, seriesOf } from '../../../../services/rfqs';
import { STATUS_INTENT, type RfqSectionProps } from './types';

const STATUS_HINT: Record<RfqStatus, string> = {
  Draft: 'Pick Open to send the RFQ.',
  'Not Confirmed': 'Awaiting approval.',
  Open: 'Awaiting vendor response. Close or cancel when done.',
  Closed: 'Closed for good.',
  Cancelled: 'Cancelled for good.',
};

interface DocumentCardProps extends RfqSectionProps {
  transitions: Partial<Record<RfqStatus, () => void>>;
}

export function DocumentCard({ draft, update, errors, ctx, transitions }: DocumentCardProps) {
  const h = bind(draft, update);
  const series = seriesOf(draft.seriesId);
  const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;

  return (
    <Section icon="tag" title="Document">
      <Fields>
        <FormField label="No." required error={errors.docNum} tooltip={ctx.added ? undefined : series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the RFQ is added.'}>
          {(p) => (
            <div className="flex gap-1">
              <Select
                aria-label="Series"
                className="w-40"
                disabled={ctx.added}
                options={rfqSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                value={draft.seriesId}
                onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
              />
              {series.manual && !ctx.added ? (
                <TextField
                  {...p}
                  className="flex-1"
                  type="number"
                  placeholder="RFQ number"
                  value={draft.docNum ? String(draft.docNum) : ''}
                  onChange={(e) => update({ docNum: Number(e.currentTarget.value) })}
                />
              ) : (
                <span className="flex-1 self-center text-sm">
                  {draft.docNum ? rfqNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}
                </span>
              )}
            </div>
          )}
        </FormField>
        <StatusField
          statuses={RFQ_STATUSES}
          intents={STATUS_INTENT}
          value={draft.status}
          moves={transitions}
          hint={STATUS_HINT[draft.status]}
          error={errors.status}
        />
        {h.date('postingDate', 'Posting date', {
          required: true,
          error: errors.postingDate,
          disabled: ctx.added,
          hint: postingMoved ? '⚠ Not today: this breaks the continuity of document numbers and dates.' : 'Defaults to today.',
        })}
        {h.date('validUntil', 'Valid until', {
          hint: 'Expiry date for the quoted prices.',
        })}
        {h.date('documentDate', 'Document date', {
          required: true,
          error: errors.documentDate,
          hint: 'The date for tax purposes. Defaults to today.',
        })}
        <FormField label="Required date" hint="When the items are needed. Cascades to new lines.">
          {(p) => (
            <DatePicker
              {...p}
              value={draft.requiredDate || null}
              onValueChange={(v) => {
                const date = v ?? '';
                update({
                  requiredDate: date,
                  lines: draft.lines.map((l) =>
                    !l.requiredDate || l.requiredDate === draft.requiredDate
                      ? { ...l, requiredDate: date }
                      : l,
                  ),
                });
              }}
            />
          )}
        </FormField>
      </Fields>
    </Section>
  );
}
