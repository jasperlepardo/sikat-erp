import { DocumentCard } from '../../../../components/form/DocumentCard';
import { dpiSeries } from '../../../../services/allSeries';
import { dpiNumber } from '../../../../services/apDownPaymentInvoices';
import type { DpiSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function DpiDocumentCard({ draft, update, errors, ctx, m }: DpiSectionProps) {
  return (
    <DocumentCard
      series={draft.status === 'Draft' ? {
        rows: [...dpiSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: dpiNumber(draft),
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
        hint: ctx.based ? 'Locked to the currency of the source document.' : "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
