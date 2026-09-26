import { useRef, useState } from 'react';
import { Button, Icon, Table, TableActions, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { CURRENT_USER, type Attachment } from '../../mocks/common';
import { Section } from './fields';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/**
 * Attachments table with Browse / Display / Delete. Prototype: only file details
 * are saved; a file can be opened until the page reloads (there's no server).
 */
export function AttachmentsCard({
  attachments,
  onChange,
  emptyHint,
  withDescription = false,
}: {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  emptyHint: string;
  /** Show an editable Description column and the Created by stamp. */
  withDescription?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Attachment[] = [];
    const nextUrls = { ...urls };
    for (const file of Array.from(files)) {
      const id = `att-${crypto.randomUUID().slice(0, 8)}`;
      added.push({
        id,
        fileName: file.name,
        size: file.size,
        attachedOn: new Date().toISOString().slice(0, 10),
        description: '',
        createdBy: CURRENT_USER,
      });
      nextUrls[id] = URL.createObjectURL(file);
    }
    setUrls(nextUrls);
    onChange([...attachments, ...added]);
  };

  const columns: TableColumn<Attachment>[] = [
    { key: 'fileName', header: 'File name', cell: (a) => a.fileName },
    ...(withDescription
      ? [
          {
            key: 'description',
            header: 'Description',
            cell: (a: Attachment) => (
              <TextField
                aria-label={`Description of ${a.fileName}`}
                size="md"
                placeholder="What is this file?"
                value={a.description ?? ''}
                onChange={(e) =>
                  onChange(attachments.map((x) => (x.id === a.id ? { ...x, description: e.currentTarget.value } : x)))
                }
              />
            ),
          },
          { key: 'createdBy', header: 'Created by', cell: (a: Attachment) => a.createdBy ?? '—' },
        ]
      : []),
    { key: 'size', header: 'Size', cell: (a) => formatSize(a.size) },
    { key: 'attachedOn', header: withDescription ? 'Created on' : 'Attached on', cell: (a) => a.attachedOn },
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
              onClick={() => onChange(attachments.filter((x) => x.id !== a.id))}
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
      {attachments.length ? (
        <Table caption="Attachments" columns={columns} rows={attachments} getRowId={(a) => a.id} />
      ) : (
        <Text variant="small" tone="muted">
          {emptyHint}
        </Text>
      )}
      <Text variant="caption">Prototype: file details are saved, but files can only be opened until you reload.</Text>
    </Section>
  );
}
