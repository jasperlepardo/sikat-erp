import { DocumentCard } from '../../../../components/form/DocumentCard';
import { poSeries } from '../../../../services/allSeries';
import { poNumber } from '../../../../services/purchaseOrders';
import type { PoSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function PoDocumentCard({ draft, update, errors, ctx, m }: PoSectionProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...poSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: poNumber(draft),
        noun: 'PO',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency, currencyView: 'BP' }),
        readOnly: ctx.readOnly || draft.lines.some((l) => l.receivedQty > 0),
        required: true,
        error: errors.currency,
        hint: draft.lines.some((l) => l.receivedQty > 0)
          ? 'Locked: goods were already received on this PO.'
          : "Defaults to the vendor's currency. Override it before receiving goods.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
