import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Icon, Table, Text, type TableColumn, type TableSort } from '@jasperlepardo/sikat-design-system';

export interface DataTableProps<T> {
  icon: string;
  title: string;
  description?: ReactNode;
  /** Buttons on the right of the title row (e.g. "New"). */
  actions?: ReactNode;
  rows: T[];
  columns: TableColumn<T>[];
  getRowId: (row: T) => string;
  /** Value a column sorts by; defaults to the row field named by the column key. */
  sortValue?: (row: T, key: string) => string | number;
  /** Keys of columns that shouldn't sort (e.g. action buttons). Columns with `sortable: false` also don't. */
  unsortable?: string[];
  onRowAction?: (row: T) => void;
  /** Makes rows selectable with a "Remove selected" button. */
  onRemove?: (rows: T[]) => void;
  /** Shown instead of the table when there are no rows. */
  empty: ReactNode;
  pageSize?: number;
  /** Shows the table's column-settings ("tune") button. */
  onColumnSettings?: () => void;
  /** Show all rows with no pagination controls. */
  noPagination?: boolean;
}

/** Page sizes every paginated table offers; tables open at `DEFAULT_PAGE_SIZE`. */
export const PAGE_SIZES = [10, 25, 50, 100, 250];
export const DEFAULT_PAGE_SIZE = 50;

const defaultSortValue = (row: unknown, key: string): string | number => {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
};

/**
 * A titled table in the design system's Table pattern: the Table sits directly in
 * a Card, with sortable headers and pagination, and optional row selection.
 */
export function DataTable<T>({
  icon,
  title,
  description,
  actions,
  rows,
  columns,
  getRowId,
  sortValue = defaultSortValue,
  unsortable = [],
  onRowAction,
  onRemove,
  empty,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  onColumnSettings,
  noPagination = false,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<TableSort | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<string[]>([]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, sort, sortValue]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const visible = noPagination ? sorted : sorted.slice((current - 1) * pageSize, current * pageSize);
  const liveSelection = selected.filter((id) => rows.some((r) => getRowId(r) === id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2 px-2 pt-2">
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
        <div className="flex flex-wrap items-center gap-1">
          {onRemove && liveSelection.length ? (
            <>
              <Text variant="small" tone="muted">
                {liveSelection.length} selected
              </Text>
              <Button
                type="button"
                size="small"
                variant="ghost"
                intent="danger"
                onClick={() => {
                  onRemove(rows.filter((r) => liveSelection.includes(getRowId(r))));
                  setSelected([]);
                }}
              >
                Remove selected
              </Button>
            </>
          ) : null}
          {actions}
        </div>
      </div>
      {rows.length ? (
        <Card>
          <Table
            caption={title}
            columns={columns.map((c) => ({ sortable: !unsortable.includes(c.key), ...c }))}
            rows={visible}
            getRowId={getRowId}
            sort={sort}
            onSortChange={setSort}
            layout="scroll"
            {...(onRowAction ? { onRowAction } : {})}
            {...(onColumnSettings ? { onColumnSettings } : {})}
            {...(onRemove ? { selectable: true, selectedIds: liveSelection, onSelectionChange: setSelected } : {})}
            {...(!noPagination && {
              pagination: {
                page: current,
                pageSize,
                total: rows.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              },
            })}
          />
        </Card>
      ) : (
        <div className="px-2">{empty}</div>
      )}
    </div>
  );
}
