import { DocumentCard } from '../../../../components/form/DocumentCard';
import { rfqNumber, rfqSeries } from '../../../../services/rfqs';
import { type RfqSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function RfqDocumentCard({ draft, update, errors, ctx, m }: RfqSectionProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...rfqSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: rfqNumber(draft),
        noun: 'RFQ',
        error: errors.docNum,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency }),
        readOnly: !!(ctx.vendor && ctx.added),
        required: true,
        error: errors.currency,
        hint: "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
