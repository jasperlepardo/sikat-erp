import { FormField, Select, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { PO_STATUSES, type PoStatus } from '../../../../mocks/purchaseOrders';
import { todayISO } from '../../../../services/dates';
import { poNumber, poSeries, seriesOf } from '../../../../services/purchaseOrders';
import type { PoDraft, PoSectionProps } from './types';
import { STATUS_INTENT } from './types';

const STATUS_HINT: Record<PoStatus, string> = {
  Draft: 'Pick Open to add it.',
  'Not Confirmed': 'Awaiting approval. Pick Open to approve it, or close or cancel it.',
  Open: 'Pick Closed or Cancelled to end it. Cancelling needs nothing received.',
  Closed: 'Closed for good.',
  Cancelled: 'Cancelled for good.',
};

interface DocumentCardProps extends PoSectionProps {
  transitions: Partial<Record<PoStatus, () => void>>;
}

export function DocumentCard({ draft, update, errors, ctx, transitions }: DocumentCardProps) {
  const h = bind(draft, update);
  const series = seriesOf(draft.seriesId);
  const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;

  return (
    <Section icon="tag" title="Document">
      <Fields>
        <FormField label="No." required error={errors.docNum} tooltip={ctx.added ? undefined : series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the PO is added.'}>
          {(p) => (
            <div className="flex gap-1">
              <Select
                aria-label="Series"
                className="w-40"
                disabled={ctx.added}
                options={poSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                value={draft.seriesId}
                onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
              />
              {series.manual && !ctx.added
                ? <TextField {...p} className="flex-1" type="number" placeholder="PO number" value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) })} />
                : <span className="flex-1 self-center text-sm">{draft.docNum ? poNumber(draft) : <span className="text-(--color-text-placeholder)">Next number</span>}</span>
              }
            </div>
          )}
        </FormField>
        <StatusField
          statuses={PO_STATUSES}
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
          hint: postingMoved
            ? '⚠ Not today: this breaks the continuity of document numbers and dates.'
            : 'Defaults to today. Sets the exchange rate and tax rates used.',
        })}
        <DeliveryDate draft={draft} update={update} error={errors.deliveryDate} />
        {h.date('documentDate', 'Document date', {
          required: true,
          error: errors.documentDate,
          hint: 'The date for tax purposes. Defaults to today.',
        })}
        <ReadOnly label="Close date" value={draft.closeDate || '—'} hint="Set when the PO is closed or cancelled." />
      </Fields>
    </Section>
  );
}

/** Header delivery date; changing it also moves line dates that matched the old one. */
export function DeliveryDate({ draft, update, error }: { draft: PoDraft; update: (p: Partial<PoDraft>) => void; error?: string }) {
  const h = bind(draft, (p) =>
    update({
      ...p,
      lines: draft.lines.map((l) => (!l.deliveryDate || l.deliveryDate === draft.deliveryDate ? { ...l, deliveryDate: p.deliveryDate ?? '' } : l)),
    }),
  );
  return h.date('deliveryDate', 'Delivery date', {
    required: true,
    error,
    hint: 'When the items should arrive. Lines take it unless they have their own.',
  });
}
