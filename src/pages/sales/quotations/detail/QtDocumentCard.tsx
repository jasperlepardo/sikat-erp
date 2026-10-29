import { Select, TextField } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatExchangeRate } from '../../../../services/format';
import { todayISO, formatDate } from '../../../../services/dates';
import { activeOptions } from '../../../../services/inventoryMasters';
import { qtSeries } from '../../../../services/allSeries';
import { qtNumber, seriesOf } from '../../../../services/quotations';
import type { QtTabProps } from './types';

/** Series, number, currency and the quotation's dates. Status transitions live in the page header. */
export function QtDocumentCard({ draft, update, errors, ctx, m }: QtTabProps) {
  const h = bind(draft, update);
  const series = seriesOf(draft.seriesId);
  const postingMoved = draft.postingDate && draft.postingDate !== todayISO() && !ctx.added;

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="tag" title="Document">
        <FieldStack>
          {!ctx.added ? (
            <CtxFormField label="No." required error={errors.docNum} tooltip={series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the quotation is added.'}>
              {(p) => (
                <div className="flex gap-1">
                  <Select
                    aria-label="Series"
                    className="w-40"
                    options={activeOptions([...qtSeries.snapshot()], (s) => s.id, (s) => s.name, draft.seriesId)}
                    value={draft.seriesId}
                    onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
                  />
                  {series.manual
                    ? <TextField {...p} className="flex-1" type="number" placeholder="Quotation number" value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) })} />
                    : <span className="flex-1 self-center text-sm">{draft.docNum ? qtNumber(draft) : <span className="text-placeholder">Next number</span>}</span>
                  }
                </div>
              )}
            </CtxFormField>
          ) : (
            <ReadOnly label="No." value={qtNumber(draft)} />
          )}
          {h.date('postingDate', 'Quotation date', {
            required: true,
            error: errors.postingDate,
            disabled: ctx.added,
            hint: postingMoved
              ? '⚠ Not today: this breaks the continuity of document numbers and dates.'
              : 'Sets the exchange rate, tax rates and which prices apply.',
          })}
          {h.date('validUntil', 'Valid until', { hint: 'After this date the quotation is expired.' })}
          {h.date('documentDate', 'Document date', {
            required: true,
            error: errors.documentDate,
            hint: 'The date for tax purposes. Defaults to today.',
          })}
          {h.lookup('currency', 'Currency', activeOptions(m.currencies, (c) => c.code, (c) => `${c.code} · ${c.name}`, draft.currency), { hint: "Defaults from the customer's currency." })}
          <ReadOnly label="Exchange rate" value={formatExchangeRate(draft.currency, ctx.fxRate?.rate ?? 0, { date: ctx.fxRate?.date, source: ctx.fxRate?.source })} hint={draft.currency === 'PHP' ? undefined : 'From the quotation date; sets how totals convert to PHP.'} />
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the quotation is closed or cancelled." />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
