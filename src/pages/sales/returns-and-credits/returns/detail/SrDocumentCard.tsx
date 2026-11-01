import { DocumentCard } from '../../../../../components/form/DocumentCard';
import { srSeries } from '../../../../../services/allSeries';
import { srNumber } from '../../../../../services/salesReturns';
import type { SrSectionProps } from '../../types';

/** Series, number, currency and exchange rate. Dates live in the Dates card. */
export function SrDocumentCard({ draft, update, errors, ctx, m }: SrSectionProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...srSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: srNumber(draft),
        noun: 'Return',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: ctx.based ? undefined : (currency) => update({ currency }),
        readOnly: ctx.added,
        hint: ctx.based ? 'Locked to the source document.' : "Defaults from the customer's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
