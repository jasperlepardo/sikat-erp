import { Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import type { TabProps } from './GeneralTab';
import { Section, type Draft } from './fields';

interface RequiredDoc {
  name: string;
  onFile: boolean;
  reference?: string;
  validUntil?: string;
  dateLabel?: string;
}

function requiredDocs(draft: Draft): RequiredDoc[] {
  const docs: RequiredDoc[] = [];
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');

  if (isCustomer) {
    for (const e of draft.vatExemptions) {
      docs.push({
        name: e.type === 'Zero-rated' ? 'Zero-rating certificate' : `VAT exemption — ${e.basis || e.certificateRef || 'certificate'}`,
        onFile: e.attachments.length > 0,
        reference: e.certificateRef || undefined,
        validUntil: e.validUntil || undefined,
      });
    }
  }

  if (isVendor || isCustomer) {
    docs.push({
      name: 'BIR Certificate of Registration (Form 2303)',
      onFile: !!draft.birCorNumber,
      reference: draft.birCorNumber || undefined,
    });
  }

  if (isVendor && !draft.nonResident) {
    docs.push({
      name: 'Sworn Declaration of Gross Income (RR 11-2018)',
      onFile: draft.swornDeclarationAttachments.length > 0,
      reference: draft.swornDeclarationRef || undefined,
      validUntil: draft.swornDeclarationDate || undefined,
      dateLabel: 'Date submitted',
    });
  }

  if (isVendor && draft.nonResident) {
    docs.push({
      name: 'Tax treaty certificate / TTRA',
      onFile: !!draft.taxTreatyCertificate,
      reference: draft.taxTreatyCertificate || undefined,
      validUntil: draft.taxTreatyCertificateExpiry || undefined,
    });
  }

  return docs;
}

export function AttachmentsTab({ draft, update }: TabProps) {
  const docs = requiredDocs(draft);

  return (
    <>
      {docs.length ? (
        <Section icon="checklist" title="Required documents">
          <List.Group>
            {docs.map((doc) => (
              <List.Card
                key={doc.name}
                icon={<Icon size={16}>{doc.onFile ? 'check_circle' : 'warning'}</Icon>}
                title={doc.name}
                fields={[
                  ...(doc.reference ? [{ label: 'Reference no.', value: doc.reference }] : []),
                  ...(doc.validUntil ? [{ label: doc.dateLabel ?? 'Valid until', value: doc.validUntil }] : []),
                ]}
              />
            ))}
          </List.Group>
          <Text variant="small" tone="muted">
            Add or update reference numbers in the Settings tab. Upload the actual documents below.
          </Text>
        </Section>
      ) : null}
      <AttachmentsCard
        attachments={draft.attachments}
        onChange={(attachments) => update({ attachments })}
        emptyHint="No attachments. Add contracts, BIR certificates, permits or IDs."
      />
    </>
  );
}
