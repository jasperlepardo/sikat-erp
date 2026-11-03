import { DocumentCard } from '../../../../components/form/DocumentCard';
import { soSeries } from '../../../../services/allSeries';
import { soNumber } from '../../../../services/salesOrders';
import type { SoTabProps } from './types';

/** Series, number, currency and exchange rate. Dates live in the Dates card. */
export function SoDocumentCard({ draft, update, errors, ctx, m }: SoTabProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...soSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: soNumber(draft),
        noun: 'Order',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency }),
        readOnly: ctx.added,
        hint: "Defaults from the customer's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the order date; sets how totals convert to PHP.',
      }}
    />
  );
}
