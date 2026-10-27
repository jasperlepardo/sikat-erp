import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { useCollection } from '../../../../components/form/MasterLookup';
import { baNumber, salesAgreementsCollection } from '../../../../services/blanketAgreements';
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
  // The customer's approved sales blanket agreements (and the one already named).
  const agreements = (useCollection(salesAgreementsCollection) ?? [])
    .filter((a) => a.id === draft.blanketAgreementId || (a.status === 'Approved' && a.customerId === draft.customerId))
    .map((a) => ({ value: a.id, label: `${baNumber(a)} · ${a.description}` }));
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
          {h.lookup('blanketAgreementId', 'Blanket agreement', agreements, { clearable: true, placeholder: 'None' })}
          {h.text('reference', 'Reference', { hint: draft.type === 'Customer' ? "The customer's reference for this payment." : undefined })}
          <ReadOnly label="Created by Payment Wizard" value="No" />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
