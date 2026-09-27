import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  Icon,
  Table,
  TableLink,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { Section, type Errors } from './fields';

export interface MasterListProps<T extends { id: string }> {
  icon: string;
  title: string;
  /** One line under the title: what the list is for. */
  description?: ReactNode;
  rows: T[] | undefined;
  /** Columns are sortable unless they set `sortable: false`. */
  columns: TableColumn<T>[];
  /** Text the search box matches against. */
  searchText: (row: T) => string;
  /** Value a column sorts by (defaults to the row field named by the column key). */
  sortValue?: (row: T, key: string) => string | number;
  /** Initial sort. Defaults to the first column, ascending. */
  defaultSort?: TableSort;
  /** A fresh row for "New". */
  blank: () => T;
  /** Label for a row in the editor title. */
  label: (row: T) => string;
  editor: (row: T, update: (patch: Partial<T>) => void, errors: Errors) => ReactNode;
  /** Field errors for a row about to be saved (checked against all rows). */
  validate: (row: T, all: T[]) => Errors;
  onSave: (row: T) => Promise<void>;
  /** Makes rows selectable with "Activate / Deactivate selected". */
  onSetActive?: (rows: T[], active: boolean) => Promise<void>;
  /** Extra controls next to "New" (e.g. an import button). */
  actions?: ReactNode;
  noun: string;
}

const defaultSortValue = <T,>(row: T, key: string): string | number => {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : String(v ?? '').toLowerCase();
};

/**
 * A master-data list in the design system's Table pattern — the Table sits
 * directly in a Card, with sortable headers, row selection, the row "…" action
 * and pagination — plus an editor for the picked or new row. Rows are
 * deactivated rather than deleted, since documents may reference them.
 */
export function MasterList<T extends { id: string }>({
  icon,
  title,
  description,
  rows,
  columns,
  searchText,
  sortValue = defaultSortValue,
  defaultSort,
  blank,
  label,
  editor,
  validate,
  onSave,
  onSetActive,
  actions,
  noun,
}: MasterListProps<T>) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<{ row: T; isNew: boolean } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState<TableSort | null>(defaultSort ?? { key: columns[0].key, direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !q || searchText(r).toLowerCase().includes(q));
    if (!sort) return list;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, query, searchText, sort, sortValue]);

  // Keep the page in range as rows are filtered or deactivated.
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const open = (row: T, isNew = false) => {
    setDraft({ row: structuredClone(row), isNew });
    setErrors({});
  };

  // Bring the editor into view when a row is opened (not on every keystroke).
  const editorRef = useRef<HTMLDivElement>(null);
  const openKey = draft ? `${draft.isNew}:${draft.row.id}` : '';
  useEffect(() => {
    if (openKey) editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [openKey]);

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

  const setActive = async (active: boolean) => {
    if (!onSetActive) return;
    await onSetActive(
      (rows ?? []).filter((r) => selected.includes(r.id)),
      active,
    );
    setSelected([]);
  };

  // The first column opens the row, like the name links on the other lists.
  const tableColumns: TableColumn<T>[] = columns.map((c, i) => ({
    sortable: true,
    ...c,
    ...(i === 0
      ? {
          cell: (r: T) => (
            <TableLink onClick={() => open(r)}>
              {c.cell ? c.cell(r) : String((r as Record<string, unknown>)[c.key])}
            </TableLink>
          ),
        }
      : {}),
  }));

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

      <div className="flex flex-wrap items-start justify-between gap-2 px-2 pt-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon size={24}>{icon}</Icon>
          <div className="min-w-0">
            <p className="font-semibold text-heading">{title}</p>
            {description ? (
              <Text variant="small" tone="muted">
                {description}
              </Text>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {onSetActive && selected.length ? (
            <>
              <Text variant="small" tone="muted">
                {selected.length} selected
              </Text>
              <Button type="button" size="small" variant="ghost" onClick={() => setActive(true)}>
                Activate
              </Button>
              <Button type="button" size="small" variant="ghost" intent="danger" onClick={() => setActive(false)}>
                Deactivate
              </Button>
            </>
          ) : null}
          {actions}
          <Button
            type="button"
            size="small"
            intent="primary"
            variant="solid"
            aria-label={`New ${noun}`}
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={() => open(blank(), true)}
          >
            New
          </Button>
        </div>
      </div>
      <TextField
        aria-label={`Search ${title.toLowerCase()}`}
        placeholder={`Search ${title.toLowerCase()}`}
        leadingIcon={<Icon size={20}>search</Icon>}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setPage(1);
        }}
      />
      <Card>
        {rows ? (
          <Table
            caption={title}
            columns={tableColumns}
            rows={visible}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            onRowAction={(r) => open(r)}
            {...(onSetActive ? { selectable: true, selectedIds: selected, onSelectionChange: setSelected } : {})}
            pagination={{
              page: current,
              pageSize,
              total: filtered.length,
              pageSizes: [10, 25, 50],
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
          />
        ) : (
          <p className="p-4 text-muted">Loading…</p>
        )}
      </Card>
    </>
  );
}
