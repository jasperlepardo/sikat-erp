import { bankChargeCodeDef } from '../../settings/masterDefs';
import { Fields, Flags, ReadOnly, Section, bind, type TabProps } from './fields';

export function PaymentRunTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="published_with_changes" title="Payment run options">
      <Fields>
        {f.master('bankChargesCode', 'Bank charges allocation', bankChargeCodeDef, { clearable: true })}
        {f.text('paymentReference', 'Reference details', { placeholder: 'e.g. Invoice no. or account ref', hint: 'Printed on the payment run file.' })}
        <ReadOnly label="Control no." value={draft.controlNo || '—'} hint="Assigned by the bank or the payment run." />
      </Fields>
      <Flags>
        {f.check('paymentBlock', 'Payment block')}
        {f.check('singlePayment', 'Single payment per document')}
        {f.check('collectionAuthorization', 'Collection authorization (direct debit)')}
        {f.check('autoBankCharges', 'Auto-calculate bank charges for incoming payments')}
      </Flags>
    </Section>
  );
}
