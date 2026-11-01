import { Section, FieldOrientationCtx, Form, Flags, ReadOnly, bind, type Errors } from '../../../../../components/form/fields';
import { paymentTermDef, projectDef } from '../../../../settings/masterDefs';
import { activeOptions } from '../../../../../services/inventoryMasters';
import type { BaDraft, BaMasters } from '../types';

const AGREEMENT_TYPE_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'Renewal', label: 'Renewal' },
  { value: 'Framework', label: 'Framework' },
  { value: 'Volume', label: 'Volume' },
];

const AGREEMENT_METHOD_OPTIONS = [
  { value: 'Items', label: 'Items method' },
  { value: 'Money', label: 'Money method' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CARD', label: 'Credit / debit card' },
  { value: 'GCASH', label: 'GCash' },
  { value: 'CHECK', label: 'Check' },
];

interface Props {
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  errors: Errors;
  m: BaMasters;
  readOnly: boolean;
}

export function AgreementSettingsCard({ draft, update, errors: _errors, m, readOnly: _readOnly }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="event_note" title="Agreement">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.choose('agreementType', 'Agreement type', AGREEMENT_TYPE_OPTIONS, { required: true })}
          {f.choose('agreementMethod', 'Agreement method', AGREEMENT_METHOD_OPTIONS, { required: true, hint: 'Items method tracks quantities per line; Money method tracks a total value.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { clearable: true, hint: 'Defaults from the customer.' })}
          {f.choose('paymentMethod', 'Payment method', PAYMENT_METHOD_OPTIONS, { clearable: true })}
          {f.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true })}
          {f.num('settlementProbability', 'Settlement probability %', { hint: 'Estimated likelihood of full settlement (0–100).', suffix: '%' })}
          {f.master('projectId', 'Business partner project', projectDef, { clearable: true })}
          <ReadOnly label="Ignore prices in agreement" value={draft.ignorePrices ? 'Yes — agreement prices excluded' : 'No'} hint="Controlled by Agreement Type." />
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>
        {f.check('renewal', 'Eligible for automatic renewal')}
      </Flags>
      {draft.renewal ? (
        <FieldOrientationCtx.Provider value="inline">
          <Form.Group orientation="inline">
            {f.num('reminderDays', 'Reminder (days before expiry)', { hint: 'Alert this many days before the agreement ends.', suffix: 'days' })}
          </Form.Group>
        </FieldOrientationCtx.Provider>
      ) : null}
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.text('description', 'Description', { hint: 'Free-text description of the agreement.' })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
