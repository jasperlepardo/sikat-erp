import { Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { normalize } from '../../services/globalSearch';
import { createGroups } from './docTypes';

/** Fixed position under the navbar + button, its right edge on the button's, kept inside the viewport. */
function placeUnder(button: HTMLElement): CSSProperties {
  const box = button.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 32);
  const left = Math.min(Math.max(box.right - width, 16), window.innerWidth - 16 - width);
  return { top: box.bottom + 6, left, width };
}

/**
 * The navbar + button's menu: a "New …" command for every document, partner and item, grouped by
 * app with the current app first. Type to narrow it; ↑↓ and Enter pick; Esc closes. Always light,
 * like the search results.
 */
export function CreateMenu({ button, appId, onClose }: { button: HTMLElement; appId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>(() => placeUnder(button));

  const groups = useMemo(() => {
    const q = normalize(filter);
    return createGroups(appId)
      .map((g) => ({ ...g, actions: q ? g.actions.filter((a) => normalize(a.label).includes(q)) : g.actions }))
      .filter((g) => g.actions.length);
  }, [appId, filter]);
  const flat = useMemo(() => groups.flatMap((g) => g.actions), [groups]);

  useEffect(() => setActive(0), [filter]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onResize = () => setPlace(placeUnder(button));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [button]);

  // A mouse-down outside the menu closes it; the + button toggles it itself.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.contains(t)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [button, onClose]);

  // The + button says it opened a menu, for screen readers.
  useLayoutEffect(() => {
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'true');
    return () => button.setAttribute('aria-expanded', 'false');
  }, [button]);

  const close = () => {
    onClose();
    button.focus();
  };

  const pick = (href: string, newTab = false) => {
    if (newTab) window.open(`#${href}`, '_blank', 'noopener');
    else navigate(href);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      pick(flat[active].href, e.metaKey || e.ctrlKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  const optionId = (n: number) => `${id}-option-${n}`;
  let n = -1;

  return (
    <div
      ref={panel}
      data-theme="light"
      style={place}
      className="fixed z-50 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl border border-default bg-default text-body shadow-md"
    >
      <div className="border-b border-default p-2">
        <TextField
          autoFocus
          role="combobox"
          aria-label="Create"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-activedescendant={flat[active] ? optionId(active) : undefined}
          aria-autocomplete="list"
          placeholder="Find what to create…"
          leadingIcon={<Icon size={20}>add</Icon>}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Create" className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.app.id} role="group" aria-labelledby={`${id}-${g.app.id}`} className="mb-2 last:mb-0">
            <div id={`${id}-${g.app.id}`} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {g.app.label}
            </div>
            {g.actions.map((a) => {
              n += 1;
              const index = n;
              const selected = index === active;
              return (
                <div
                  key={a.key}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm ${selected ? 'bg-neutral-subtle' : ''}`}
                  onMouseMove={() => !selected && setActive(index)}
                  onClick={(e) => pick(a.href, e.metaKey || e.ctrlKey)}
                >
                  <Icon size={20} className="flex-none text-muted">{a.glyph}</Icon>
                  <span className="truncate">{a.label}</span>
                </div>
              );
            })}
          </div>
        ))}
        {!flat.length ? (
          <Text tone="muted" className="px-2 py-6 text-center text-sm">{`Nothing to create called "${filter.trim()}"`}</Text>
        ) : null}
      </div>
    </div>
  );
}
