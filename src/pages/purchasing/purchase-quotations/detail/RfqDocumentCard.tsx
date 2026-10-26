import { DatePicker, Select, TextField } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { RFQ_STATUSES, type RfqStatus } from '../../../../mocks/rfqs';
import { todayISO } from '../../../../services/dates';
import { rfqNumber, rfqSeries, seriesOf } from '../../../../services/rfqs';
import { type RfqSectionProps } from './types';
import { RFQ_STATUS_INTENT } from '../../paths';
import { activeOptions } from '../../../../services/inventoryMasters';

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

export function RfqDocumentCard({ draft, update, errors, ctx, transitions }: DocumentCardProps) {
  const h = bind(draft, update);
  const series = seriesOf(draft.seriesId);
  const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;

  return (
    <Section icon="tag" title="Document">
      <FieldStack>
        {!ctx.added && (
          <CtxFormField label="No." required error={errors.docNum} tooltip={series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the RFQ is added.'}>
            {(p) => (
              <div className="flex gap-1">
                <Select
                  aria-label="Series"
                  className="w-40"
                  options={activeOptions([...rfqSeries.snapshot()], (s) => s.id, (s) => s.name, draft.seriesId)}
                  value={draft.seriesId}
                  onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
                />
                {series.manual ? (
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
          </CtxFormField>
        )}
        {!ctx.added && (
          <StatusField
            statuses={RFQ_STATUSES}
            intents={RFQ_STATUS_INTENT}
            value={draft.status}
            moves={transitions}
            hint={STATUS_HINT[draft.status]}
            error={errors.status}
          />
        )}
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
        <CtxFormField label="Required date" hint="When the items are needed. Cascades to new lines.">
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
        </CtxFormField>
      </FieldStack>
    </Section>
  );
}
