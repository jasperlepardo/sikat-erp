import { DocumentCard } from '../../../../components/form/DocumentCard';
import { qtSeries } from '../../../../services/allSeries';
import { qtNumber } from '../../../../services/quotations';
import type { QtTabProps } from './types';

/** Series, number, currency and exchange rate. Dates live in the Dates card. */
export function QtDocumentCard({ draft, update, errors, ctx, m }: QtTabProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...qtSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: qtNumber(draft),
        noun: 'Quotation',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency }),
        readOnly: ctx.readOnly,
        hint: "Defaults from the customer's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the quotation date; sets how totals convert to PHP.',
      }}
    />
  );
}
