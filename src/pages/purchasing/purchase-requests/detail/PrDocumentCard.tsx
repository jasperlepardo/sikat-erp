import { DocumentCard } from '../../../../components/form/DocumentCard';
import { prSeries } from '../../../../services/allSeries';
import { prNumber } from '../../../../services/purchaseRequests';
import type { PrSectionProps } from './types';

/** Series and number, on draft only. A request carries no currency. */
export function PrDocumentCard({ draft, update, errors, ctx }: PrSectionProps) {
  return (
    <DocumentCard
      series={ctx.added ? undefined : {
        rows: [...prSeries.snapshot()],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: prNumber(draft),
        noun: 'Request',
        error: errors.docNum,
        readOnly: ctx.readOnly,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
    />
  );
}
