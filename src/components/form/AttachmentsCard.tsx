import { useRef, useState } from 'react';
import { Card, Icon, Link, List, Text, TextField, Button } from '@jasperlepardo/sikat-design-system';
import { CURRENT_USER, type Attachment } from '../../mocks/common';
import { RowMenu } from './RowMenu';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'picture_as_pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'table_chart';
  if (['docx', 'doc'].includes(ext)) return 'description';
  if (['zip', 'rar', '7z'].includes(ext)) return 'folder_zip';
  return 'attach_file';
};

export function AttachmentsCard({
  attachments,
  onChange,
  emptyHint,
  withDescription = false,
}: {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  emptyHint: string;
  withDescription?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');

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

  const saveDesc = (id: string) => {
    onChange(attachments.map((a) => (a.id === id ? { ...a, description: editDesc } : a)));
    setEditingId(null);
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = ''; }}
      />
      <Card>
        <Card.Header
          icon={<Icon size={24}>attach_file</Icon>}
          actions={
            <Link leadingIcon={<Icon size={20}>upload</Icon>} onClick={() => input.current?.click()}>
              Browse
            </Link>
          }
        >
          {`Attachments${attachments.length ? ` · ${attachments.length}` : ''}`}
        </Card.Header>
        <Card.Content>
          {attachments.length ? (
            <List.Group>
              {attachments.map((a) =>
                editingId === a.id ? (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <TextField
                        placeholder="What is this file?"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDesc(a.id); } if (e.key === 'Escape') setEditingId(null); }}
                      />
                    </div>
                    <Button type="button" size="small" intent="primary" variant="solid" onClick={() => saveDesc(a.id)}>
                      Save
                    </Button>
                    <Button type="button" size="small" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </li>
                ) : (
                  <List.Card
                    key={a.id}
                    title={a.fileName}
                    icon={<Icon size={16}>{fileIcon(a.fileName)}</Icon>}
                    fields={[
                      ...(withDescription && a.description ? [{ label: 'Description', value: a.description }] : []),
                      { label: 'Size', value: formatSize(a.size) },
                      { label: withDescription ? 'Created on' : 'Attached on', value: a.attachedOn },
                      ...(withDescription && a.createdBy ? [{ label: 'Created by', value: a.createdBy }] : []),
                    ].filter((f) => f.value)}
                    actions={
                      <RowMenu
                        label={`Actions for ${a.fileName}`}
                        items={[
                          { label: 'Display', icon: 'open_in_new', disabled: !urls[a.id], onSelect: () => window.open(urls[a.id], '_blank') },
                          ...(withDescription ? [{ label: 'Edit description', icon: 'edit', onSelect: () => { setEditingId(a.id); setEditDesc(a.description ?? ''); } }] : []),
                          { label: 'Delete', icon: 'delete', onSelect: () => onChange(attachments.filter((x) => x.id !== a.id)) },
                        ]}
                      />
                    }
                  />
                ),
              )}
            </List.Group>
          ) : (
            <Text variant="small" tone="muted">{emptyHint}</Text>
          )}
        </Card.Content>
      </Card>
    </>
  );
}
