import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, Table, TableLink, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Section, type Errors } from './fields';

export interface MasterListProps<T extends { id: string }> {
  icon: string;
  title: string;
  /** One line under the title: what the list is for. */
  description?: ReactNode;
  rows: T[] | undefined;
  columns: TableColumn<T>[];
  /** Text the search box matches against. */
  searchText: (row: T) => string;
  /** A fresh row for "New". */
  blank: () => T;
  /** Label for a row in the editor title. */
  label: (row: T) => string;
  editor: (row: T, update: (patch: Partial<T>) => void, errors: Errors) => ReactNode;
  /** Field errors for a row about to be saved (checked against all rows). */
  validate: (row: T, all: T[]) => Errors;
  onSave: (row: T) => Promise<void>;
  /** Extra controls next to "New" (e.g. an import button). */
  actions?: ReactNode;
  noun: string;
}

/**
 * A master-data list: searchable table, and an editor for the picked or new row.
 * Rows are deactivated rather than deleted, since documents may reference them.
 */
export function MasterList<T extends { id: string }>({
  icon,
  title,
  description,
  rows,
  columns,
  searchText,
  blank,
  label,
  editor,
  validate,
  onSave,
  actions,
  noun,
}: MasterListProps<T>) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<{ row: T; isNew: boolean } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  // Bring the editor into view when a row is opened (not on every keystroke).
  const editorRef = useRef<HTMLDivElement>(null);
  const openKey = draft ? `${draft.isNew}:${draft.row.id}` : '';
  useEffect(() => {
    if (openKey) editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [openKey]);

  const open = (row: T, isNew = false) => {
    setDraft({ row: structuredClone(row), isNew });
    setErrors({});
  };

  // The first column opens the row, like the name links on other lists.
  const linkedColumns: TableColumn<T>[] = columns.map((c, i) =>
    i === 0 ? { ...c, cell: (r: T) => <TableLink onClick={() => open(r)}>{c.cell ? c.cell(r) : String(r[c.key as keyof T])}</TableLink> } : c,
  );

  const save = async () => {
    if (!draft) return;
    const found = validate(draft.row, rows ?? []);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await onSave(draft.row);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {draft ? (
        <div ref={editorRef}>
          <Section
            icon={draft.isNew ? 'add_circle' : 'edit'}
            title={draft.isNew ? `New ${noun}` : label(draft.row)}
            actions={
              <div className="flex gap-1">
                <Button type="button" size="small" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" size="small" intent="primary" variant="solid" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            }
          >
            {editor(draft.row, (patch) => setDraft({ ...draft, row: { ...draft.row, ...patch } }), errors)}
          </Section>
        </div>
      ) : null}
      <Section
        icon={icon}
        title={title}
        actions={
          <div className="flex items-center gap-1">
            {actions}
            <Button
              type="button"
              size="small"
              variant="ghost"
              aria-label={`New ${noun}`}
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={() => open(blank(), true)}
            >
              New
            </Button>
          </div>
        }
      >
        {description ? (
          <Text variant="small" tone="muted">
            {description}
          </Text>
        ) : null}
        <TextField
          aria-label={`Search ${title.toLowerCase()}`}
          placeholder="Search"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        {rows ? (
          <Table
            caption={title}
            columns={linkedColumns}
            rows={filtered}
            getRowId={(r) => r.id}
            onRowAction={(r) => open(r)}
          />
        ) : (
          <Text variant="small" tone="muted">
            Loading…
          </Text>
        )}
      </Section>
    </>
  );
}
