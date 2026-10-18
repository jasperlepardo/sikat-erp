import { useState } from 'react';
import { Button, DatePicker, Icon, Link, List, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { REFERENCE_DOC_TYPES, type PoReference } from '../../../mocks/purchaseOrders';
import { RowMenu } from '../../../components/form/RowMenu';
import { Section } from '../../../components/form/fields';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

type EditDraft = Omit<PoReference, 'id'>;

export function ReferencesTable({
  refs,
  onChange,
  readOnly,
  description,
}: {
  refs: PoReference[];
  onChange: (refs: PoReference[]) => void;
  readOnly: boolean;
  description: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ docType: 'Purchase request', docNo: '', docDate: '', remarks: '' });

  const startEdit = (r: PoReference) => {
    setEditingId(r.id);
    setEditDraft({ docType: r.docType, docNo: r.docNo, docDate: r.docDate, remarks: r.remarks });
  };

  const saveEdit = (id: string) => {
    onChange(refs.map((r) => (r.id === id ? { ...r, ...editDraft } : r)));
    setEditingId(null);
  };

  const addNew = () => {
    const id = `ref-${crypto.randomUUID().slice(0, 8)}`;
    const blank: PoReference = { id, docType: 'Purchase request', docNo: '', docDate: '', remarks: '' };
    onChange([...refs, blank]);
    setEditingId(id);
    setEditDraft({ docType: 'Purchase request', docNo: '', docDate: '', remarks: '' });
  };

  return (
    <Section
      icon="link"
      title={`Referenced documents${refs.length ? ` (${refs.length})` : ''}`}
      actions={
        readOnly ? undefined : (
          <Link leadingIcon={<Icon size={20}>add</Icon>} onClick={addNew}>
            Add
          </Link>
        )
      }
    >
      {refs.length ? (
        <List.Group>
          {refs.map((r) =>
            editingId === r.id ? (
              <List.Item key={r.id}>
                <List.Content>
                  <div className="flex flex-col gap-2">
                    <Select
                      aria-label="Document type"
                      options={asOptions(REFERENCE_DOC_TYPES)}
                      value={editDraft.docType}
                      onValueChange={(docType) => setEditDraft((d) => ({ ...d, docType }))}
                    />
                    <TextField
                      aria-label="Document no."
                      placeholder="Document no."
                      value={editDraft.docNo}
                      onChange={(e) => setEditDraft((d) => ({ ...d, docNo: e.currentTarget.value }))}
                    />
                    <DatePicker
                      aria-label="Document date"
                      value={editDraft.docDate || null}
                      onValueChange={(docDate) => setEditDraft((d) => ({ ...d, docDate: docDate ?? '' }))}
                    />
                    <TextField
                      aria-label="Remarks"
                      placeholder="Remarks"
                      value={editDraft.remarks}
                      onChange={(e) => setEditDraft((d) => ({ ...d, remarks: e.currentTarget.value }))}
                    />
                  </div>
                </List.Content>
                <List.Trailing className="flex gap-1">
                  <Button type="button" size="small" intent="primary" variant="solid" onClick={() => saveEdit(r.id)}>
                    Save
                  </Button>
                  <Button type="button" size="small" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </List.Trailing>
              </List.Item>
            ) : (
              <List.Card
                key={r.id}
                title={r.docType}
                icon={<Icon size={16}>link</Icon>}
                fields={[
                  ...(r.docNo ? [{ label: 'Document no.', value: r.docNo }] : []),
                  ...(r.docDate ? [{ label: 'Date', value: r.docDate }] : []),
                  ...(r.remarks ? [{ label: 'Remarks', value: r.remarks }] : []),
                ]}
                actions={
                  readOnly ? undefined : (
                    <RowMenu
                      label={`Actions for ${r.docType}`}
                      items={[
                        { label: 'Edit', icon: 'edit', onSelect: () => startEdit(r) },
                        { label: 'Delete', icon: 'delete', onSelect: () => onChange(refs.filter((x) => x.id !== r.id)) },
                      ]}
                    />
                  )
                }
              />
            ),
          )}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          {description}
        </Text>
      )}
    </Section>
  );
}
