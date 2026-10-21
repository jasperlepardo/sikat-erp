import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, Dropdown, Icon, IconButton, Link, Text, useDropdown, type TableColumn } from '@jasperlepardo/sikat-design-system';

/**
 * A table column that can optionally be hidden through the column-settings panel.
 * Omit `optional` for columns that always show (item, quantity, price, total) — the panel lists
 * them checked and locked; set `defaultHidden` on an optional column that starts collapsed.
 * A column with no header (row actions) isn't listed.
 */
export type PrefColumn<T> = TableColumn<T> & {
  optional?: boolean;
  defaultHidden?: boolean;
};

/**
 * Column-visibility layout for one document type: which optional columns are
 * shown, persisted per document type so a user's layout survives reloads. Lives
 * under the `sikat-ui:` prefix — not `sikat-erp:` — so a seed-version bump (which
 * clears `sikat-erp:` keys in store.ts) leaves the layout untouched.
 */
const STORAGE_PREFIX = 'sikat-ui:cols:';

function loadHidden(listKey: string, fallback: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + listKey);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* storage unavailable — fall back to defaults */
  }
  return new Set(fallback);
}

function saveHidden(listKey: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + listKey, JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable — layout stays in-session only */
  }
}

export interface ColumnPrefs<T> {
  /** Visible columns in declared order — pass straight to DataTable. */
  columns: PrefColumn<T>[];
  /** The "Columns" button and its dropdown of checkboxes — pass to DataTable's `columnMenu`. */
  menu: ReactNode;
  /** The same dropdown behind a "tune" icon button, for the header of a table's last (actions) column. */
  iconMenu: ReactNode;
}

/**
 * Owns per-column show/hide state for one document's contents table: visibility,
 * localStorage persistence, and the Columns dropdown. Each document passes
 * its own column list (tagging optional/defaultHidden columns); everything else
 * is shared.
 */
export function useColumnPrefs<T>(listKey: string, columns: PrefColumn<T>[]): ColumnPrefs<T> {
  const defaultHidden = useMemo(
    () => columns.filter((c) => c.optional && c.defaultHidden).map((c) => c.key),
    [columns],
  );
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(listKey, defaultHidden));

  const toggle = useCallback(
    (key: string, show: boolean) =>
      setHidden((prev) => {
        const next = new Set(prev);
        show ? next.delete(key) : next.add(key);
        saveHidden(listKey, next);
        return next;
      }),
    [listKey],
  );

  const reset = useCallback(() => {
    const next = new Set(defaultHidden);
    saveHidden(listKey, next);
    setHidden(next);
  }, [defaultHidden, listKey]);

  const visible = columns.filter((c) => !c.optional || !hidden.has(c.key));
  // Every column with a header, in table order: the panel reads as the table's layout.
  const listed = columns.filter((c) => c.header);
  const isDefault = defaultHidden.length === hidden.size && defaultHidden.every((k) => hidden.has(k));

  const menuProps = {
    listed,
    isShown: (c: PrefColumn<T>) => !c.optional || !hidden.has(c.key),
    onToggle: toggle,
    onReset: isDefault ? undefined : reset,
  };

  return { columns: visible, menu: <ColumnsMenu {...menuProps} />, iconMenu: <ColumnsMenu {...menuProps} iconOnly /> };
}

/** The table's "Columns" button: a dropdown listing every column in table order, the fixed ones locked. */
function ColumnsMenu<T>({ listed, isShown, onToggle, onReset, iconOnly }: {
  listed: PrefColumn<T>[];
  isShown: (c: PrefColumn<T>) => boolean;
  onToggle: (key: string, show: boolean) => void;
  onReset?: () => void;
  iconOnly?: boolean;
}) {
  const { open, toggle, rootRef, panelRef, anchor, side, hSide } = useDropdown();
  return (
    <div ref={rootRef} className="row-actions inline-flex">
      {iconOnly ? (
        <IconButton intent="default" variant="link" size="2xs" label="Columns" aria-haspopup="true" aria-expanded={open} onClick={toggle}>
          <Icon size={16}>tune</Icon>
        </IconButton>
      ) : (
        <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>tune</Icon>} aria-haspopup="true" aria-expanded={open} onClick={toggle}>
          Columns
        </Button>
      )}
      {open && anchor ? (
        <Dropdown
          ref={panelRef}
          anchor={anchor}
          side={side}
          hSide={hSide}
          style={{ width: 260 }}
          header={
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <Text variant="small" tone="muted">Show columns</Text>
              {onReset ? <Link intent="primary" onClick={onReset}>Reset to default</Link> : null}
            </div>
          }
        >
          <div className="flex flex-col gap-2 px-2 py-1">
            {listed.map((c) => (
              <Checkbox
                key={c.key}
                checked={isShown(c)}
                disabled={!c.optional}
                onChange={(e) => onToggle(c.key, e.currentTarget.checked)}
              >
                {c.header}
              </Checkbox>
            ))}
          </div>
        </Dropdown>
      ) : null}
    </div>
  );
}
