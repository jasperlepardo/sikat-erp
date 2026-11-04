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

export function AgreementSettingsCard({ draft, update, errors: _errors, m, readOnly }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="event_note" title="Agreement">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {f.choose('agreementType', 'Agreement type', AGREEMENT_TYPE_OPTIONS, { required: true, readOnly })}
          {f.choose('agreementMethod', 'Agreement method', AGREEMENT_METHOD_OPTIONS, { required: true, readOnly })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { clearable: true, hint: 'Defaults from the customer.', readOnly })}
          {f.choose('paymentMethod', 'Payment method', PAYMENT_METHOD_OPTIONS, { clearable: true, readOnly })}
          {f.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly })}
          {f.num('settlementProbability', 'Settlement probability %', { suffix: '%', readOnly })}
          {f.master('projectId', 'Business partner project', projectDef, { clearable: true, readOnly })}
          <ReadOnly label="Ignore prices in agreement" value={draft.ignorePrices ? 'Yes — agreement prices excluded' : 'No'} hint="Controlled by Agreement Type." />
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>
        {f.check('renewal', 'Eligible for automatic renewal', { readOnly })}
      </Flags>
      {draft.renewal ? (
        <FieldOrientationCtx.Provider value="stacked">
          <Form.Group orientation="stacked">
            {f.num('reminderDays', 'Reminder (days before expiry)', { suffix: 'days', readOnly })}
          </Form.Group>
        </FieldOrientationCtx.Provider>
      ) : null}
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {f.text('description', 'Description', { readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
