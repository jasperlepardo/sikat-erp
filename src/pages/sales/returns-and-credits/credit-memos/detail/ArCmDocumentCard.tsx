import { DocumentCard } from '../../../../../components/form/DocumentCard';
import { arCreditSeries } from '../../../../../services/allSeries';
import { arCmNumber } from '../../../../../services/arCreditMemos';
import type { ArCmSectionProps } from '../../types';

/** Series, number, currency and exchange rate. Dates live in the Dates card. */
export function ArCmDocumentCard({ draft, update, errors, ctx, m }: ArCmSectionProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...arCreditSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: arCmNumber(draft),
        noun: 'Credit memo',
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
