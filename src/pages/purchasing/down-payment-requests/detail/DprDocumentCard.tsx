import { DocumentCard } from '../../../../components/form/DocumentCard';
import { dprSeries } from '../../../../services/allSeries';
import { dprNumber } from '../../../../services/apDownPayments';
import { type DprSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function DprDocumentCard({ draft, update, errors, ctx, m }: DprSectionProps) {
  return (
    <DocumentCard
      series={ctx.readOnly ? undefined : {
        rows: [...dprSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: dprNumber(draft),
        noun: 'Request',
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
        hint: ctx.based ? 'Locked to the currency of the source document.' : "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
