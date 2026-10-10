import { Section, Fields, Flags, ReadOnly, bind } from '../../../../components/form/fields';
import { paymentTermDef, salesEmployeeDef } from '../../../settings/masterDefs';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { PbaDraft, PbaMasters } from './types';

const AGREEMENT_TYPE_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'Renewal', label: 'Renewal' },
  { value: 'Framework', label: 'Framework' },
  { value: 'Volume', label: 'Volume' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: '— None —' },
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
  readOnly: boolean;
}

export function GeneralTab({ draft, update, m, readOnly: _readOnly }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="tune" title="Agreement Settings">
      <Fields cols={2}>
        {f.choose('agreementType', 'Agreement type', AGREEMENT_TYPE_OPTIONS, { required: true })}
        {f.choose('status', 'Status', PBA_STATUS_OPTIONS)}
        {f.master('paymentTermId', 'Payment terms', paymentTermDef, { clearable: true, hint: 'Defaults from the vendor.' })}
        {f.choose('paymentMethod', 'Payment method', PAYMENT_METHOD_OPTIONS)}
        {f.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
        {f.num('settlementProbability', 'Settlement probability %', { hint: 'Estimated likelihood of full settlement (0–100).', suffix: '%' })}
        {f.master('ownerId', 'Owner', salesEmployeeDef, { clearable: true, placeholder: '— None —' })}
        <ReadOnly label="Ignore prices in agreement" value={draft.ignorePrices ? 'Yes — agreement prices excluded' : 'No'} hint="Controlled by Agreement Type." />
      </Fields>
      <Flags>
        {f.check('renewal', 'Eligible for automatic renewal')}
      </Flags>
      {draft.renewal
        ? (
          <Fields cols={2}>
            {f.num('reminderDays', 'Reminder (days before expiry)', { hint: 'Alert this many days before the agreement ends.', suffix: 'days' })}
          </Fields>
        )
        : null}
      {f.area('remarks', 'Remarks', { rows: 4 })}
    </Section>
  );
}
