import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Button,
  Card,
  Icon,
  IconButton,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  SidePanel,
  Table,
  TableLink,
  TableStatus,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { Section, type Errors } from './fields';
import { useHeaderSearch } from './HeaderSearch';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from './DataTable';

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
  /**
   * When provided, the list renders as a collapsible tree. Return child rows for
   * each row, or undefined / [] for leaves. Pagination is suppressed; the search
   * box switches to a flat view so every match is reachable.
   */
  getSubRows?: (row: T) => T[] | undefined;
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
  /** Shown between the title and the search box (e.g. a calculator or reference card). */
  intro?: ReactNode;
  /**
   * Suppress the list header (icon, title, description, New button). Use this
   * when the page already has a PanelHeader with its own New button. The
   * activate / deactivate toolbar still appears inline when rows are selected.
   */
  hideHeader?: boolean;
  /**
   * Open records in a SidePanel overlay instead of navigating to a separate page.
   * Pass `recordId` from the URL so the panel opens for the right row (or a new
   * one when `recordId === 'new'`). The list stays visible behind the panel.
   */
  sidePanelEdit?: boolean;
  /** Current record id from the URL — used by `sidePanelEdit` to know what to open. */
  recordId?: string;
  noun: string;
  /** Route of the list, e.g. /settings/accounting-and-tax/tax-codes. Rows open at `${basePath}/${id}`. */
  basePath: string;
  /** Where a record page returns to, when not `basePath`. */
  listPath?: string;
  /** Centre the record page's card in the middle 6 of 12 columns (settings pages always are). */
  centered?: boolean;
  /**
   * The record's nested data (e.g. a warehouse's bins). When given, the record page is laid out
   * like a detail page: Details in a 3-column side column, this in the 9-column main one.
   */
  related?: (row: T, isNew: boolean) => ReactNode;
}

export const statusColumn = <T extends { active: boolean }>() => ({
  key: 'active',
  header: 'Status',
  cell: (r: T) => <TableStatus intent={r.active ? 'success' : 'default'}>{r.active ? 'Active' : 'Inactive'}</TableStatus>,
});

/** "is required" + "already exists" check on one text field. */
export function uniqueRequired<T extends { id: string }>(
  e: Errors,
  row: T,
  all: T[],
  key: keyof T & string,
  label: string,
) {
  const v = String(row[key] ?? '').trim();
  if (!v) e[key] = `${label} is required.`;
  else if (all.some((x) => x.id !== row.id && String(x[key]).trim().toLowerCase() === v.toLowerCase())) e[key] = `${v} already exists.`;
}

/** Route props every master-data list tab receives from its page. */
export interface ListRoute {
  basePath: string;
  recordId?: string;
  /** Where a record page returns to when the list lives on another tab. Defaults to `basePath`. */
  listPath?: string;
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
  if (props.recordId && !props.sidePanelEdit) return <RecordPage key={props.recordId} {...props} recordId={props.recordId} />;
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
  intro,
  noun,
  basePath,
  getSubRows,
  hideHeader,
  sidePanelEdit,
  recordId,
  blank,
  label,
  editor,
  validate,
  onSave,
}: MasterListProps<T>) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettings = location.pathname.startsWith('/settings');

  // Side panel state (only used when sidePanelEdit=true)
  const isPanelNew = sidePanelEdit && recordId === 'new';
  const panelExisting = sidePanelEdit && recordId && recordId !== 'new'
    ? (rows ?? []).find((r) => r.id === recordId)
    : undefined;
  const isPanelOpen = sidePanelEdit && !!recordId;
  const panelLoaded = rows !== undefined;
  const panelFresh = useMemo(
    () => (isPanelNew && panelLoaded && blank ? blank() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPanelNew, panelLoaded],
  );
  const [panelDraft, setPanelDraft] = useState<T | null>(null);
  const [panelErrors, setPanelErrors] = useState<Errors>({});
  const [panelSaving, setPanelSaving] = useState(false);
  const panelRow = panelDraft ?? panelFresh ?? (panelExisting ? structuredClone(panelExisting) : null);
  const panelUpdate = (patch: Partial<T>) => setPanelDraft((d) => ({ ...(d ?? panelRow!), ...patch }));
  const closePanel = () => { setPanelDraft(null); setPanelErrors({}); navigate(basePath); };
  const savePanel = async () => {
    if (!panelRow || !validate || !onSave) return;
    const errs = validate(panelRow, rows ?? []);
    setPanelErrors(errs);
    if (Object.keys(errs).length) return;
    setPanelSaving(true);
    try { await onSave(panelRow); closePanel(); } finally { setPanelSaving(false); }
  };
  // In the page header when the page hosts one, else a box above the table.
  const headerSearch = useHeaderSearch(`Search ${title.toLowerCase()}`);
  const [localQuery, setLocalQuery] = useState('');
  const query = headerSearch?.query ?? localQuery;
  const setQuery = headerSearch?.setQuery ?? setLocalQuery;
  const [sort, setSort] = useState<TableSort | null>(defaultSort ?? { key: columns[0].key, direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  // A new search starts from the first page.
  useEffect(() => setPage(1), [query]);

  const isSearching = query.trim().length > 0;
  const useTree = !!getSubRows && !isSearching;

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

  // In tree mode pass only root rows; sub-rows come from getSubRows.
  const rootIds = useMemo(() => {
    if (!useTree) return null;
    const childIds = new Set((rows ?? []).flatMap((r) => (getSubRows(r) ?? []).map((c) => c.id)));
    return childIds;
  }, [useTree, rows, getSubRows]);

  const displayRows = useTree ? filtered.filter((r) => !rootIds!.has(r.id)) : filtered;

  // Keep the page in range as rows are filtered or deactivated.
  const pages = useTree ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = useTree ? 1 : Math.min(page, pages);
  const visible = useTree ? displayRows : displayRows.slice((current - 1) * pageSize, current * pageSize);

  const open = (row: T) => navigate(`${basePath}/${encodeURIComponent(row.id)}`);
  // A tree's parent rows count once, as rows.
  const selectedCount = (rows ?? []).filter((r) => selected.includes(r.id)).length;

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

  const showHeader = !hideHeader && (!isSettings || !!(onSetActive && selectedCount) || !!actions);

  return (
    <>
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-2 px-2 pt-2">
          {!isSettings && (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Icon size={24}>{icon}</Icon>
              <div className="min-w-0">
                <Text weight="semibold" tone="heading">{title}</Text>
                {description ? (
                  <Text variant="small" tone="muted">
                    {description}
                  </Text>
                ) : null}
              </div>
            </div>
          )}
          <div className={`flex flex-wrap items-center gap-1${isSettings ? ' ml-auto' : ''}`}>
            {onSetActive && selectedCount ? (
              <>
                <Text variant="small" tone="muted">
                  {selectedCount} selected
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
            {!isSettings && (
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
            )}
          </div>
        </div>
      )}
      {hideHeader && onSetActive && selectedCount ? (
        <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
          <Text variant="small" tone="muted">{selectedCount} selected</Text>
          <Button type="button" size="small" variant="ghost" onClick={() => setActive(true)}>Activate</Button>
          <Button type="button" size="small" variant="ghost" intent="danger" onClick={() => setActive(false)}>Deactivate</Button>
        </div>
      ) : null}
      {intro}
      {headerSearch ? null : (
        <TextField
          aria-label={`Search ${title.toLowerCase()}`}
          placeholder={`Search ${title.toLowerCase()}`}
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      )}
      <Card className={fillCardClass(visible.length)}>
        {rows ? (
          <Table
            caption={title}
            columns={tableColumns}
            rows={visible}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            onRowAction={(r) => open(r)}
            {...(onSetActive ? { selectable: true, selectedIds: selected, onSelectionChange: setSelected } : {})}
            {...(useTree ? { getSubRows } : {
              pagination: {
                page: current,
                pageSize,
                total: filtered.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              },
            })}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading…</Text>
        )}
      </Card>

      {isPanelOpen && panelRow && editor && label && (
        <SidePanel overlay onOverlayClick={closePanel}>
          <PanelHeader
            type="details"
            icon={icon}
            title={isPanelNew ? `New ${noun}` : label(panelRow)}
            actions={
              <>
                <IconButton type="button" label="Close" intent="default" variant="link" onClick={closePanel}>
                  <Icon size={20}>close</Icon>
                </IconButton>
                <Button type="button" intent="default" variant="solid" size="extra-large" onClick={closePanel}>
                  Cancel
                </Button>
                <Button type="button" intent="primary" variant="solid" size="extra-large" disabled={panelSaving} onClick={savePanel}>
                  {panelSaving ? 'Saving…' : isPanelNew ? 'Add' : 'Save'}
                </Button>
              </>
            }
          />
          <Panel.Body className="flex flex-col gap-2">
            {Object.keys(panelErrors).length ? (
              <Text variant="small" tone="danger">Fix the highlighted fields to save.</Text>
            ) : null}
            {editor(panelRow, panelUpdate, panelErrors, !!isPanelNew)}
          </Panel.Body>
        </SidePanel>
      )}
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
  listPath = basePath,
  centered,
  related,
  recordId,
}: MasterListProps<T> & { recordId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettings = location.pathname.startsWith('/settings');
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
  const back = () => navigate(listPath);

  if (!loaded) return <Text tone="muted" className="p-4">Loading…</Text>;
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

  const siblings = [...(rows ?? [])].sort((a, b) => label(a).localeCompare(label(b))).map((r) => r.id);
  const at = siblings.indexOf(recordId);
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;

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
        type="details"
        icon={icon}
        title={isNew ? `New ${noun}` : label(row)}
        subcopy={title}
        // A saved record leads with previous/next (through the list, by name); a new one with the icon.
        leading={
          isNew ? undefined : (
            <>
              <IconButton
                type="button"
                label="Next"
                intent="default"
                variant="solid"
                size="extra-large"
                disabled={!nextId}
                onClick={() => navigate(`${basePath}/${nextId}`)}
              >
                {panelHeaderIcons.arrowDownward}
              </IconButton>
              <IconButton
                type="button"
                label="Previous"
                intent="default"
                variant="solid"
                size="extra-large"
                disabled={!prevId}
                onClick={() => navigate(`${basePath}/${prevId}`)}
              >
                {panelHeaderIcons.arrowUpward}
              </IconButton>
            </>
          )
        }
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
      {related ? (
        /* Side by side (lg), each column scrolls on its own; stacked, the body scrolls as one. */
        <Panel.Body className="flex flex-col gap-2 lg:overflow-hidden!">
          {Object.keys(errors).length ? (
            <Text variant="small" tone="danger">
              Fix the highlighted fields to save.
            </Text>
          ) : null}
          <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-1">
            <aside className="flex flex-col gap-2 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto">
              <Section icon={isNew ? 'add_circle' : 'edit'} title="Details">
                {editor(row, (patch) => setDraft({ ...row, ...patch }), errors, isNew)}
              </Section>
            </aside>
            <div className="flex min-w-0 flex-col gap-2 lg:col-span-9 lg:min-h-0 lg:overflow-y-auto">{related(row, isNew)}</div>
          </div>
        </Panel.Body>
      ) : (
        <Panel.Body className="flex flex-col gap-2">
          <div className={isSettings || centered ? 'grid grid-cols-12 gap-2' : 'contents'}>
            <div className={isSettings || centered ? 'col-span-12 flex flex-col gap-2 lg:col-span-6 lg:col-start-4' : 'contents'}>
              {Object.keys(errors).length ? (
                <Text variant="small" tone="danger">
                  Fix the highlighted fields to save.
                </Text>
              ) : null}
              <Section icon={isNew ? 'add_circle' : 'edit'} title="Details">
                {editor(row, (patch) => setDraft({ ...row, ...patch }), errors, isNew)}
              </Section>
            </div>
          </div>
        </Panel.Body>
      )}
    </Panel>
  );
}
