import { useRef } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { fileIcon, formatSize, toAttachments } from '../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../components/form/RowMenu';
import type { Attachment } from '../../../mocks/common';
import { Section, type Draft } from './fields';

interface RequiredDoc {
  name: string;
  onFile: boolean;
  reference?: string;
  validUntil?: string;
  dateLabel?: string;
}

/** Documents the partner's roles and tax setup call for, and whether each is on file. */
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

/** Every file on the partner, with what it belongs to. Only general ones can be removed here. */
function allFiles(draft: Draft): { file: Attachment; source: string; general: boolean }[] {
  return [
    ...draft.attachments.map((file) => ({ file, source: 'General', general: true })),
    ...draft.swornDeclarationAttachments.map((file) => ({ file, source: 'Sworn declaration', general: false })),
    ...draft.vatExemptions.flatMap((e) =>
      e.attachments.map((file) => ({ file, source: e.type === 'Zero-rated' ? 'Zero-rating' : `VAT exemption ${e.certificateRef}`.trim(), general: false })),
    ),
    ...draft.taxTreatyIncomes.flatMap((t) => t.attachments.map((file) => ({ file, source: `Treaty: ${t.incomeType}`, general: false }))),
  ];
}

/**
 * The partner's attachments in the side column: required documents still missing, then every
 * file (general uploads and those filed under the Tax tab's exemptions, sworn declaration and
 * treaty incomes). Browse adds general attachments.
 */
export function AttachmentsCards({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const missing = requiredDocs(draft).filter((d) => !d.onFile);
  const files = allFiles(draft);

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.currentTarget.files?.length) update({ attachments: [...draft.attachments, ...toAttachments(e.currentTarget.files)] });
          e.currentTarget.value = '';
        }}
      />
      <Section
        icon="attach_file"
        title={`Attachments${files.length ? ` (${files.length})` : ''}`}
        actions={
          <Link aria-label="Browse for attachments" leadingIcon={<Icon size={20}>upload</Icon>} onClick={() => input.current?.click()}>
            Browse
          </Link>
        }
      >
        {missing.length || files.length ? (
          <List.Group>
            {missing.map((d) => (
              <List.Card
                key={d.name}
                title={d.name}
                icon={<Icon size={16}>warning</Icon>}
                fields={[
                  { label: 'Status', value: 'Required — not on file' },
                  ...(d.reference ? [{ label: 'Reference no.', value: d.reference }] : []),
                ]}
              />
            ))}
            {files.map(({ file, source, general }) => (
              <List.Card
                key={file.id}
                title={file.fileName}
                icon={<Icon size={16}>{fileIcon(file.fileName)}</Icon>}
                fields={[
                  { label: 'For', value: source },
                  { label: 'Description', value: file.description ?? '' },
                  { label: 'Size', value: formatSize(file.size) },
                  { label: 'Attached on', value: file.attachedOn },
                ].filter((x) => x.value)}
                actions={
                  general ? (
                    <RowMenu
                      label={`Actions for ${file.fileName}`}
                      items={[
                        {
                          label: 'Remove',
                          icon: 'delete',
                          onSelect: () => update({ attachments: draft.attachments.filter((a) => a.id !== file.id) }),
                        },
                      ]}
                    />
                  ) : undefined
                }
              />
            ))}
          </List.Group>
        ) : (
          <Text variant="small" tone="muted">
            No attachments yet. Add contracts, BIR certificates, permits or IDs.
          </Text>
        )}
        {files.some((f) => !f.general) ? (
          <Text variant="small" tone="muted">
            Files for exemptions, the sworn declaration and treaty incomes are added and removed in the Tax tab.
          </Text>
        ) : null}
      </Section>
    </>
  );
}
