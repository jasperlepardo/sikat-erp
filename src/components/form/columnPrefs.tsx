import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Card, Checkbox, Icon, type TableColumn } from '@jasperlepardo/sikat-design-system';

/**
 * A table column that can optionally be hidden through the column-settings panel.
 * Omit `optional` for columns that always show (item, quantity, price, total);
 * set `defaultHidden` on an optional column that starts collapsed.
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
  /** The "tune" settings Card (null while closed) — render above the table. */
  settings: ReactNode;
  /** Wire to DataTable's `onColumnSettings` to open/close the panel. */
  toggleSettings: () => void;
}

/**
 * Owns per-column show/hide state for one document's contents table: visibility,
 * localStorage persistence, and the checkbox settings Card. Each document passes
 * its own column list (tagging optional/defaultHidden columns); everything else
 * is shared.
 */
export function useColumnPrefs<T>(listKey: string, columns: PrefColumn<T>[]): ColumnPrefs<T> {
  const defaultHidden = useMemo(
    () => columns.filter((c) => c.optional && c.defaultHidden).map((c) => c.key),
    [columns],
  );
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(listKey, defaultHidden));
  const [open, setOpen] = useState(false);

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

  const visible = columns.filter((c) => !c.optional || !hidden.has(c.key));
  const optional = columns.filter((c) => c.optional);

  const settings = open ? (
    <Card>
      <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
      <Card.Content>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {optional.map((c) => (
            <Checkbox key={c.key} checked={!hidden.has(c.key)} onChange={(e) => toggle(c.key, e.currentTarget.checked)}>
              {c.header}
            </Checkbox>
          ))}
        </div>
      </Card.Content>
    </Card>
  ) : null;

  return { columns: visible, settings, toggleSettings: () => setOpen((v) => !v) };
}
