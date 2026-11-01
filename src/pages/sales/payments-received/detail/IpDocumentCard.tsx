import { DocumentCard } from '../../../../components/form/DocumentCard';
import { ReadOnly, type Errors } from '../../../../components/form/fields';
import type { Currency } from '../../../../mocks/currencies';
import { INCOMING_SERIES } from '../../../../mocks/incomingPayments';
import { incomingNumber, type IncomingInput } from '../../../../services/incomingPayments';

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  errors: Errors;
  readOnly: boolean;
  currencies: Currency[];
  rate?: { rate: number; date: string; source: string };
}

export function IncomingDocumentCard({ draft, update, errors, readOnly, currencies, rate }: Props) {
  return (
    <DocumentCard
      icon="calendar_today"
      series={readOnly ? undefined : {
        rows: INCOMING_SERIES,
        seriesId: draft.seriesId,
        docNum: draft.docNum,
        number: incomingNumber(draft),
        noun: 'Receipt',
        error: errors.docNum,
        onSeries: (seriesId) => update({ seriesId, docNum: 0 }),
        onNumber: (docNum) => update({ docNum }),
      }}
      currency={{
        code: draft.currency,
        currencies,
        hint: "The customer's currency — change it in the Account card.",
        rate,
        rateHint: 'From the posting date; sets how the receipt converts to PHP.',
      }}
      extra={
        <ReadOnly
          label="Transaction no."
          value={draft.transNo ? String(draft.transNo) : '—'}
          hint={draft.docNum ? `Journal entry of ${incomingNumber(draft)}.` : "The journal entry's number, once added."}
        />
      }
    />
  );
}
