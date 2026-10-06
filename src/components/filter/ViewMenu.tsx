import { useEffect, useRef, useState } from 'react';
import { Divider, Dropdown, DropdownItem, Icon, Text } from '@jasperlepardo/sikat-design-system';
import type { ListView, ListViews } from './useListViews';

/**
 * The list's title as a menu of its filter presets: built-ins first, then saved ones,
 * then the actions (new, save, edit, delete). Use as `PanelHeader`'s `title`.
 */
export function ViewMenu({
  views,
  count,
  onNew,
  onEdit,
}: {
  views: ListViews;
  /** Rows a view would show, for the counts beside each name. */
  count?: (view: ListView) => number | undefined;
  onNew: () => void;
  onEdit: () => void;
}) {
  const { current, edited } = views;
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => setConfirmDelete(false), [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = (view: ListView) => {
    const n = count?.(view);
    return (
      <DropdownItem
        key={view.id}
        selected={view.id === current.id}
        leadingIcon={<Icon size={20}>{view.id === current.id ? 'check' : view.builtIn ? 'list' : 'filter_list'}</Icon>}
        suffix={n === undefined ? undefined : String(n)}
        onSelect={run(() => views.select(view.id))}
      >
        {view.name}
      </DropdownItem>
    );
  };

  const builtIns = views.views.filter((v) => v.builtIn);
  const saved = views.views.filter((v) => !v.builtIn);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-left"
        onClick={() => setOpen(!open)}
      >
        <span>{current.name}</span>
        {edited ? (
          <Text as="span" variant="small" tone="muted">
            · edited
          </Text>
        ) : null}
        <Icon size={20}>keyboard_arrow_down</Icon>
      </button>
      {open ? (
        <Dropdown role="menu" style={{ left: 0, width: 300, maxHeight: '70vh' }}>
          {builtIns.map(item)}
          {saved.length ? (
            <>
              <Divider />
              <Text variant="small" tone="muted" className="px-3 pt-1">
                Saved presets
              </Text>
              {saved.map(item)}
            </>
          ) : null}
          <Divider />
          {edited ? (
            <>
              {!current.builtIn ? (
                <DropdownItem leadingIcon={<Icon size={20}>save</Icon>} onSelect={run(() => void views.saveChanges())}>
                  Save changes to “{current.name}”
                </DropdownItem>
              ) : null}
              <DropdownItem leadingIcon={<Icon size={20}>undo</Icon>} onSelect={run(views.reset)}>
                Discard changes
              </DropdownItem>
            </>
          ) : null}
          <DropdownItem leadingIcon={<Icon size={20}>add</Icon>} onSelect={run(onNew)}>
            New filter preset
          </DropdownItem>
          {!current.builtIn ? (
            <>
              <DropdownItem leadingIcon={<Icon size={20}>edit</Icon>} onSelect={run(onEdit)}>
                Edit “{current.name}”
              </DropdownItem>
              <DropdownItem
                leadingIcon={<Icon size={20}>delete</Icon>}
                onSelect={confirmDelete ? run(() => void views.remove(current.id)) : () => setConfirmDelete(true)}
              >
                {confirmDelete ? `Click again to delete “${current.name}”` : 'Delete preset'}
              </DropdownItem>
            </>
          ) : null}
        </Dropdown>
      ) : null}
    </div>
  );
}
