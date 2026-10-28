import { Section, FieldStack, Flags, ReadOnly, bind } from '../../../../../components/form/fields';
import { paymentTermDef, salesEmployeeDef } from '../../../../settings/masterDefs';
import { activeOptions } from '../../../../../services/inventoryMasters';
import type { PbaDraft, PbaMasters } from '../types';

const AGREEMENT_TYPE_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'Renewal', label: 'Renewal' },
  { value: 'Framework', label: 'Framework' },
  { value: 'Volume', label: 'Volume' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHECK', label: 'Check' },
  { value: 'GCASH', label: 'GCash' },
];

const PBA_STATUS_OPTIONS = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Approved', label: 'Approved' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'Terminated', label: 'Terminated' },
  { value: 'Closed', label: 'Closed' },
];

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  m: PbaMasters;
  /** Once added, the agreement's commercial settings lock. */
  readOnly: boolean;
  /** At a terminal status (Closed/Terminated) the status itself locks too — no outgoing moves. */
  terminal: boolean;
}

export function AgreementSettingsCard({ draft, update, m, readOnly, terminal }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="tune" title="Agreement Settings">
      {/* Status drives the lifecycle, so it stays editable until a terminal status. */}
      <FieldStack>
        {f.choose('status', 'Status', PBA_STATUS_OPTIONS, { readOnly: terminal })}
      </FieldStack>
      <fieldset disabled={readOnly} className="contents">
        <FieldStack>
          {f.choose('agreementType', 'Agreement type', AGREEMENT_TYPE_OPTIONS, { required: true })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { clearable: true, hint: 'Defaults from the vendor.' })}
          {f.choose('paymentMethod', 'Payment method', PAYMENT_METHOD_OPTIONS, { clearable: true })}
          {f.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true })}
          {f.num('settlementProbability', 'Settlement probability %', { hint: 'Estimated likelihood of full settlement (0–100).', suffix: '%' })}
          {f.master('ownerId', 'Owner', salesEmployeeDef, { clearable: true, placeholder: 'None' })}
          <ReadOnly label="Ignore prices in agreement" value={draft.ignorePrices ? 'Yes — agreement prices excluded' : 'No'} hint="Controlled by Agreement Type." />
        </FieldStack>
        <Flags>
          {f.check('renewal', 'Eligible for automatic renewal')}
        </Flags>
        {draft.renewal
          ? (
            <FieldStack>
              {f.num('reminderDays', 'Reminder (days before expiry)', { hint: 'Alert this many days before the agreement ends.', suffix: 'days' })}
            </FieldStack>
          )
          : null}
      </fieldset>
      {/* Remarks stay editable at every status. */}
      <FieldStack>
        {f.area('remarks', 'Remarks', { rows: 4 })}
      </FieldStack>
    </Section>
  );
}
