import { Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import type { TabProps } from './GeneralTab';
import { Section, type Draft } from './fields';

interface RequiredDoc {
  name: string;
  onFile: boolean;
  reference?: string;
  validUntil?: string;
}

function requiredDocs(draft: Draft): RequiredDoc[] {
  const docs: RequiredDoc[] = [];
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');

  if (isCustomer && draft.salesVatTreatment === 'Zero-rated') {
    docs.push({
      name: 'Zero-rating certificate',
      onFile: !!draft.zeroRatedCertificate,
      reference: draft.zeroRatedCertificate || undefined,
      validUntil: draft.zeroRatedValidUntil || undefined,
    });
  }

  if (isCustomer && draft.salesVatTreatment === 'Exempt entity') {
    docs.push({
      name: 'Tax exemption certificate',
      onFile: !!draft.exemptionCertificate,
      reference: draft.exemptionCertificate || undefined,
      validUntil: draft.exemptionValidUntil || undefined,
    });
  }

  if (isVendor && (draft.supplierVatStatus === 'VAT-registered' || draft.supplierVatStatus === 'Non-VAT')) {
    docs.push({
      name: 'BIR Certificate of Registration (Form 2303)',
      onFile: !!draft.birCorNumber,
      reference: draft.birCorNumber || undefined,
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
                  ...(doc.reference ? [{ label: 'Certificate no.', value: doc.reference }] : []),
                  ...(doc.validUntil ? [{ label: 'Valid until', value: doc.validUntil }] : []),
                ]}
              />
            ))}
          </List.Group>
          <Text variant="small" tone="muted">
            Add or update certificate numbers in the Accounting tab.
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
