import { DocumentCard } from '../../../../components/form/DocumentCard';
import { memoSeries } from '../../../../services/allSeries';
import { memoNumber } from '../../../../services/apCreditMemos';
import type { CmSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function CmDocumentCard({ draft, update, errors, ctx, m }: CmSectionProps) {
  return (
    <DocumentCard
      series={ctx.readOnly ? undefined : {
        rows: [...memoSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: memoNumber(draft),
        noun: 'Credit memo',
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
        hint: ctx.based ? "Locked to the base documents' currency." : "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
