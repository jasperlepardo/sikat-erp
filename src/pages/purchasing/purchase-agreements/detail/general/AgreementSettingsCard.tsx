import { FieldOrientationCtx, Form, Section, Flags, ReadOnly, bind } from '../../../../../components/form/fields';
import { paymentTermDef, projectDef } from '../../../../settings/masterDefs';
import { activeOptions } from '../../../../../services/inventoryMasters';
import type { PbaDraft, PbaMasters } from '../types';

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
  { value: 'CHECK', label: 'Check' },
  { value: 'GCASH', label: 'GCash' },
];

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  m: PbaMasters;
  /** Once added, the agreement's commercial settings lock. */
  readOnly: boolean;
}

export function AgreementSettingsCard({ draft, update, m, readOnly }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="event_note" title="Agreement">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.choose('agreementType', 'Agreement type', AGREEMENT_TYPE_OPTIONS, { required: true, readOnly })}
          {f.choose('agreementMethod', 'Agreement method', AGREEMENT_METHOD_OPTIONS, { required: true, readOnly, hint: 'Items method tracks quantities per line; Money method tracks a total value.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { clearable: true, hint: 'Defaults from the vendor.', readOnly })}
          {f.choose('paymentMethod', 'Payment method', PAYMENT_METHOD_OPTIONS, { clearable: true, readOnly })}
          {f.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly })}
          {f.num('settlementProbability', 'Settlement probability %', { hint: 'Estimated likelihood of full settlement (0–100).', suffix: '%', readOnly })}
          {f.master('projectId', 'Business partner project', projectDef, { clearable: true, readOnly })}
          <ReadOnly label="Ignore prices in agreement" value={draft.ignorePrices ? 'Yes — agreement prices excluded' : 'No'} hint="Controlled by Agreement Type." />
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>
        {f.check('renewal', 'Eligible for automatic renewal', { readOnly })}
      </Flags>
      {draft.renewal
        ? (
          <FieldOrientationCtx.Provider value="inline">
            <Form.Group orientation="inline">
              {f.num('reminderDays', 'Reminder (days before expiry)', { hint: 'Alert this many days before the agreement ends.', suffix: 'days', readOnly })}
            </Form.Group>
          </FieldOrientationCtx.Provider>
        )
        : null}
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.text('description', 'Description', { hint: 'Free-text description of the agreement.', readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
