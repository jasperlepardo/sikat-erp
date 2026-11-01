import { DocumentCard } from '../../../../components/form/DocumentCard';
import { apSeries } from '../../../../services/allSeries';
import { apNumber } from '../../../../services/apInvoices';
import { type ApSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function ApDocumentCard({ draft, update, errors, ctx, m }: ApSectionProps) {
  return (
    <DocumentCard
      series={ctx.readOnly ? undefined : {
        rows: [...apSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: apNumber(draft),
        noun: 'Invoice',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency }),
        readOnly: ctx.readOnly || ctx.based,
        required: true,
        error: errors.currency,
        hint: ctx.based ? 'Locked to the currency of the documents the lines came from.' : "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
