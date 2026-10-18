import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { type IncomingType } from '../../../../mocks/incomingPayments';
import { type IncomingInput } from '../../../../services/incomingPayments';
import { projectDef } from '../../../settings/masterDefs';

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  readOnly: boolean;
  onType: (type: IncomingType) => void;
}

export function IncomingSettingsCard({ draft, update, readOnly, onType }: Props) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Payment type">
          <Text variant="small" tone="muted">Received from</Text>
          {(['Customer', 'Account'] as IncomingType[]).map((t) => (
            <Radio key={t} name="incoming-type" checked={draft.type === t} disabled={readOnly} onChange={() => onType(t)}>
              {t === 'Customer' ? 'A customer' : 'An account (no business partner)'}
            </Radio>
          ))}
          <Text variant="small" tone="muted">Vendor refunds (against A/P credit memos) aren&apos;t built yet.</Text>
        </div>
        <FieldStack>
          {h.master('projectId', 'Project', projectDef, { clearable: true })}
          {h.choose('blanketAgreement', 'Blanket agreement', [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))])}
          {h.text('reference', 'Reference', { hint: draft.type === 'Customer' ? "The customer's reference for this payment." : undefined })}
          <ReadOnly label="Created by Payment Wizard" value="No" />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
