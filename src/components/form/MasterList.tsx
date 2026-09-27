import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
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
  /** `isNew` is false once the row is saved — lock key fields other records refer to. */
  editor: (row: T, update: (patch: Partial<T>) => void, errors: Errors, isNew: boolean) => ReactNode;
  /** Field errors for a row about to be saved (checked against all rows). */
  validate: (row: T, all: T[]) => Errors;
  onSave: (row: T) => Promise<void>;
  /** Makes rows selectable with "Activate / Deactivate selected". */
  onSetActive?: (rows: T[], active: boolean) => Promise<void>;
  /** Extra controls next to "New" (e.g. an import button). */
  actions?: ReactNode;
  noun: string;
  /** Route of the list, e.g. /settings/accounting-and-tax/tax-codes. Rows open at `${basePath}/${id}`. */
  basePath: string;
  /** When set, render that record's page ('new' for a new record) instead of the list. */
  recordId?: string;
}

/** Route props every master-data list tab receives from its page. */
export interface ListRoute {
  basePath: string;
  recordId?: string;
}

const defaultSortValue = <T,>(row: T, key: string): string | number => {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : String(v ?? '').toLowerCase();
};

/**
 * A master-data list in the design system's Table pattern — the Table sits
 * directly in a Card, with sortable headers, row selection, the row "…" action
 * and pagination. Rows open on their own page (`${basePath}/${id}`, or `/new`).
 * Rows are deactivated rather than deleted, since documents may reference them.
 */
export function MasterList<T extends { id: string }>(props: MasterListProps<T>) {
  // A record id in the route means the record's own page; otherwise the list.
  if (props.recordId) return <RecordPage key={props.recordId} {...props} recordId={props.recordId} />;
  return <ListView {...props} />;
}

function ListView<T extends { id: string }>({
  icon,
  title,
  description,
  rows,
  columns,
  searchText,
  sortValue = defaultSortValue,
  defaultSort,
  onSetActive,
  actions,
  noun,
  basePath,
}: MasterListProps<T>) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
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

  const open = (row: T) => navigate(`${basePath}/${encodeURIComponent(row.id)}`);

  const setActive = async (active: boolean) => {
    if (!onSetActive) return;
    await onSetActive((rows ?? []).filter((r) => selected.includes(r.id)), active);
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
            onClick={() => navigate(`${basePath}/new`)}
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

/**
 * A master-data record on its own page: header with Cancel / Save, the editor in a
 * card, and a return to the list on save or cancel.
 */
function RecordPage<T extends { id: string }>({
  icon,
  title,
  rows,
  blank,
  label,
  editor,
  validate,
  onSave,
  noun,
  basePath,
  recordId,
}: MasterListProps<T> & { recordId: string }) {
  const navigate = useNavigate();
  const isNew = recordId === 'new';
  const [draft, setDraft] = useState<T | null>(null);
  // A new record's defaults can depend on the other rows (e.g. the next free
  // number), so it's created once the list has loaded.
  const loaded = rows !== undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => (isNew && loaded ? blank() : null), [isNew, loaded]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // An existing record arrives once the list has loaded.
  const existing = isNew ? undefined : rows?.find((r) => r.id === recordId);
  const row = draft ?? fresh ?? (existing ? structuredClone(existing) : null);
  const back = () => navigate(basePath);

  if (!loaded) return <p className="p-4 text-muted">Loading…</p>;
  if (!row) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon={icon} title={`${noun[0].toUpperCase()}${noun.slice(1)} not found`} />
        <Panel.Body>
          <Button onClick={back}>Back to {title.toLowerCase()}</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const save = async () => {
    const found = validate(row, rows ?? []);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await onSave(row);
      back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="flex-1">
      <PanelHeader
        type="forms"
        icon={icon}
        title={isNew ? `New ${noun}` : label(row)}
        subcopy={title}
        actions={
          <>
            <Button type="button" intent="default" variant="solid" size="extra-large" onClick={back}>
              Cancel
            </Button>
            <Button type="button" intent="primary" variant="solid" size="extra-large" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {Object.keys(errors).length ? (
          <Text variant="small" tone="danger">
            Fix the highlighted fields to save.
          </Text>
        ) : null}
        <Section icon={isNew ? 'add_circle' : 'edit'} title="Details">
          {editor(row, (patch) => setDraft({ ...row, ...patch }), errors, isNew)}
        </Section>
      </Panel.Body>
    </Panel>
  );
}
