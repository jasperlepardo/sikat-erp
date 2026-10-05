import { useState } from 'react';
import { Checkbox, Combobox, Radio, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Section } from '../../../components/form/fields';
import { EditPanel } from '../../partners/detail/EditPanel';

/** One document that lines can be copied from. */
export interface CopyDoc {
  id: string;
  label: string;
  description: string;
  lines: { id: string; itemNo: string; name: string; warehouse: string; total: string; open: number }[];
}

/** A kind of base document: its documents, and what copying from it means. */
export interface CopySourceType<K extends string> {
  key: K;
  /** "Goods receipts" — shown with the count. */
  label: string;
  /** Header of the column showing each line's full quantity, e.g. "Received". */
  totalHeader: string;
  /** Header of the editable quantity column, e.g. "Bill". */
  qtyHeader: string;
  hint: string;
  docs: CopyDoc[];
}

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Copy From: pick the kind of base document, then a document; its open lines come ticked at
 * their open quantity. Lines already on the document aren't offered again.
 */
export function CopyPanel<K extends string>({
  sources,
  taken,
  onCancel,
  onCopy,
}: {
  sources: CopySourceType<K>[];
  taken: Set<string>;
  onCancel: () => void;
  onCopy: (type: K, docId: string, picks: { lineId: string; qty: number }[]) => void;
}) {
  const [type, setType] = useState<K>((sources.find((s) => s.docs.length) ?? sources[0]).key);
  const source = sources.find((s) => s.key === type)!;
  const [docId, setDocId] = useState(source.docs[0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const doc = source.docs.find((d) => d.id === docId);
  const open = (doc?.lines ?? []).filter((l) => l.open > 0 && !taken.has(l.id));
  const picks = open.filter((l) => !unticked.has(l.id)).map((l) => ({ lineId: l.id, qty: qty[l.id] ?? l.open }));
  const reset = () => {
    setQty({});
    setUnticked(new Set());
  };

  const columns: TableColumn<(typeof open)[number]>[] = [
    {
      key: 'pick',
      header: '',
      cell: (l) => (
        <Checkbox
          aria-label={`Copy ${l.itemNo}`}
          checked={!unticked.has(l.id)}
          onChange={(e) => {
            const next = new Set(unticked);
            if (e.currentTarget.checked) next.delete(l.id);
            else next.add(l.id);
            setUnticked(next);
          }}
        />
      ),
    },
    { key: 'item', header: 'Item', cell: (l) => <div className="flex flex-col"><Text variant="caption">{l.itemNo}</Text><Text variant="small">{l.name}</Text></div> },
    { key: 'warehouse', header: 'Whse', cell: (l) => l.warehouse || '—' },
    { key: 'total', header: source.totalHeader, cell: (l) => l.total },
    {
      key: 'qty',
      header: source.qtyHeader,
      cell: (l) => (
        <TextField aria-label={`Quantity of ${l.itemNo}`} type="number" min={0} className="w-24" suffix={`/ ${l.open}`} value={String(qty[l.id] ?? l.open)} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(l.open, num(e.currentTarget.value)) })} />
      ),
    },
  ];

  return (
    <EditPanel icon="content_copy" title="Copy from" onCancel={onCancel} onDone={() => (doc && picks.length ? onCopy(type, doc.id, picks.filter((p) => p.qty > 0)) : onCancel())}>
      <Section icon="description" title="Base document">
        {sources.length > 1 ? (
          <div className="flex flex-wrap gap-6" role="radiogroup" aria-label="Copy from">
            {sources.map((s) => (
              <Radio
                key={s.key}
                name="copy-from"
                checked={type === s.key}
                disabled={!s.docs.length}
                onChange={() => {
                  setType(s.key);
                  setDocId(s.docs[0]?.id ?? '');
                  reset();
                }}
              >
                {s.label} ({s.docs.length})
              </Radio>
            ))}
          </div>
        ) : null}
        <Combobox
          aria-label="Document"
          options={source.docs.map((d) => ({ value: d.id, label: d.label, description: d.description, text: d.label }))}
          value={docId || null}
          onValueChange={(v) => {
            setDocId(v ?? '');
            reset();
          }}
        />
        <Text variant="small" tone="muted">{source.hint}</Text>
      </Section>
      <DataTable
        icon="list_alt"
        title="Open lines"
        description={open.length ? `${picks.length} of ${open.length} line${open.length === 1 ? '' : 's'} ticked.` : undefined}
        rows={open}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={['pick', 'qty']}
        noPagination
        empty={<Text variant="small" tone="muted">Every open line of this document is already copied.</Text>}
      />
    </EditPanel>
  );
}
