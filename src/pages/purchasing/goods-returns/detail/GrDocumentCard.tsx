import { DocumentCard } from '../../../../components/form/DocumentCard';
import { returnSeries } from '../../../../services/allSeries';
import { returnNumber } from '../../../../services/goodsReturns';
import type { GrSectionProps } from './types';

/** Series, number, currency and exchange rate. */
export function GrDocumentCard({ draft, update, errors, ctx, m }: GrSectionProps) {
  return (
    <DocumentCard
      series={ctx.readOnly ? undefined : {
        rows: [...returnSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: returnNumber(draft),
        noun: 'Return',
        error: errors.docNum,
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
