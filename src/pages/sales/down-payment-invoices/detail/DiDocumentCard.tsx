import { DocumentCard } from '../../../../components/form/DocumentCard';
import { diSeries } from '../../../../services/allSeries';
import { diNumber } from '../../../../services/arDownPaymentInvoices';
import type { DiSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the customer's — change it in the customer panel. */
export function DiDocumentCard({ draft, update, errors, ctx, m }: DiSectionProps) {
  return (
    <DocumentCard
      series={draft.status === 'Draft' ? {
        rows: [...diSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: diNumber(draft),
        noun: 'Invoice',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      } : undefined}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        onChange: (currency) => update({ currency }),
        readOnly: ctx.readOnly || ctx.based,
        required: true,
        error: errors.currency,
        hint: ctx.based ? 'Locked to the currency of the source document.' : "Defaults to the customer's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
