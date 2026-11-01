import { DocumentCard } from '../../../../components/form/DocumentCard';
import { grrSeries } from '../../../../services/allSeries';
import { grrNumber } from '../../../../services/goodsReturnRequests';
import type { GrrContext, GrrSectionProps } from './types';

type Props = Pick<GrrSectionProps, 'draft' | 'update' | 'errors' | 'm'> & { ctx: GrrContext };

/** Series, number and currency. A return request carries no exchange rate. */
export function GrrDocumentCard({ draft, update, errors, ctx, m }: Props) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...grrSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: grrNumber(draft),
        noun: 'Request',
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
        required: true,
        error: errors.currency,
        hint: "Defaults to the vendor's currency.",
        showRate: false,
      }}
    />
  );
}
