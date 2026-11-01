import { DocumentCard } from '../../../../components/form/DocumentCard';
import { pbaNumber } from '../../../../services/purchaseBlanketAgreements';
import { type PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import type { PbaDraft, PbaMasters } from './types';

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  m: PbaMasters;
  added: boolean;
}

/** Series, number and currency. The currency is the vendor's; an agreement carries no exchange rate. */
export function PbaDocumentCard({ draft, update, m, added }: Props) {
  return (
    <DocumentCard
      series={added ? undefined : {
        rows: [...m.pbaSeries],
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: pbaNumber(draft as PurchaseBlanketAgreement),
        noun: 'Agreement',
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies: m.currencies,
        hint: "Set by the vendor's currency.",
        showRate: false,
      }}
    />
  );
}
