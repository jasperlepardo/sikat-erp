import { DocumentCard } from '../../../../components/form/DocumentCard';
import { apRiSeries } from '../../../../services/allSeries';
import { apRiNumber } from '../../../../services/apReserveInvoices';
import type { ApriSectionProps } from './types';

/** Series, number, currency and exchange rate. The currency is the vendor's — change it in the vendor panel. */
export function ApriDocumentCard({ draft, update, errors, ctx, m }: ApriSectionProps) {
  return (
    <DocumentCard
      series={ctx.readOnly ? undefined : {
        rows: [...apRiSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: apRiNumber(draft),
        noun: 'Invoice',
        error: errors.docNum,
        readOnly: ctx.readOnly,
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
        hint: ctx.based ? 'Locked to the currency of the POs the lines came from.' : "Defaults to the vendor's currency.",
        rate: ctx.fxRate,
        rateHint: 'From the posting date; sets how totals convert to PHP.',
      }}
    />
  );
}
