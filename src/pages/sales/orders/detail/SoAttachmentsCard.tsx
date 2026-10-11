import { useRef } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { fileIcon, formatSize, toAttachments } from '../../../../components/form/AttachmentsCard';
import { RowMenu } from '../../../../components/form/RowMenu';
import { Section } from '../../../../components/form/fields';
import type { SoTabProps } from './types';

export function SoAttachmentsCard({ draft, update, ctx }: SoTabProps) {
  const attachInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={attachInput}
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
        title={`Attachments${draft.attachments.length ? ` (${draft.attachments.length})` : ''}`}
        actions={
          ctx.readOnly ? undefined : (
            <Link aria-label="Browse for attachments" leadingIcon={<Icon size={20}>upload</Icon>} onClick={() => attachInput.current?.click()}>
              Browse
            </Link>
          )
        }
      >
        {draft.attachments.length ? (
          <List.Group>
            {draft.attachments.map((file) => (
              <List.Card
                key={file.id}
                title={file.fileName}
                icon={<Icon size={16}>{fileIcon(file.fileName)}</Icon>}
                fields={[
                  ...(file.description ? [{ label: 'Description', value: file.description }] : []),
                  { label: 'Size', value: formatSize(file.size) },
                  { label: 'Attached on', value: file.attachedOn },
                ]}
                actions={
                  ctx.readOnly ? undefined : (
                    <RowMenu
                      label={`Actions for ${file.fileName}`}
                      items={[{ label: 'Remove', icon: 'delete', onSelect: () => update({ attachments: draft.attachments.filter((a) => a.id !== file.id) }) }]}
                    />
                  )
                }
              />
            ))}
          </List.Group>
        ) : (
          <Text variant="small" tone="muted">
            No attachments yet. Add the customer's PO, quotation or approval e-mail.
          </Text>
        )}
      </Section>
    </>
  );
}
