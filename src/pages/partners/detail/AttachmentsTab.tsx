import { useRef, useState } from 'react';
import { Button, Icon, Table, TableActions, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import type { Attachment } from '../../../mocks/partners';
import type { TabProps } from './GeneralTab';
import { Section } from './fields';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/**
 * Prototype: only file details are saved. The file itself can be opened until
 * the page reloads (there's no server to store it on).
 */
export function AttachmentsTab({ draft, update }: TabProps) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Attachment[] = [];
    const nextUrls = { ...urls };
    for (const file of Array.from(files)) {
      const id = `att-${crypto.randomUUID().slice(0, 8)}`;
      added.push({ id, fileName: file.name, size: file.size, attachedOn: new Date().toISOString().slice(0, 10) });
      nextUrls[id] = URL.createObjectURL(file);
    }
    setUrls(nextUrls);
    update({ attachments: [...draft.attachments, ...added] });
  };

  const columns: TableColumn<Attachment>[] = [
    { key: 'fileName', header: 'File name', cell: (a) => a.fileName },
    { key: 'size', header: 'Size', cell: (a) => formatSize(a.size) },
    { key: 'attachedOn', header: 'Attached on', cell: (a) => a.attachedOn },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      cell: (a) => (
        <TableActions>
          {[
            <Button
              key="display"
              type="button"
              size="small"
              variant="ghost"
              disabled={!urls[a.id]}
              onClick={() => window.open(urls[a.id], '_blank')}
            >
              Display
            </Button>,
            <Button
              key="delete"
              type="button"
              size="small"
              variant="ghost"
              intent="danger"
              onClick={() => update({ attachments: draft.attachments.filter((x) => x.id !== a.id) })}
            >
              Delete
            </Button>,
          ]}
        </TableActions>
      ),
    },
  ];

  return (
    <Section
      icon="attach_file"
      title="Attachments"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          leadingIcon={<Icon size={16}>upload</Icon>}
          onClick={() => input.current?.click()}
        >
          Browse
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />
      {draft.attachments.length ? (
        <Table caption="Attachments" columns={columns} rows={draft.attachments} getRowId={(a) => a.id} />
      ) : (
        <Text variant="small" tone="muted">
          No attachments. Add contracts, BIR 2303 certificates, permits or IDs.
        </Text>
      )}
      <Text variant="caption">Prototype: file details are saved, but files can only be opened until you reload.</Text>
    </Section>
  );
}
