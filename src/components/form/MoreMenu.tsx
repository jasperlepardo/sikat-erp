import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, DropdownItem, Icon, type ButtonProps } from '@jasperlepardo/sikat-design-system';

export interface MoreMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
}

/** "More actions" — related actions for the record, in the page header. Other menus pass their own `label` and button look. */
export function MoreMenu({
  items,
  label = 'More actions',
  button,
}: {
  items: MoreMenuItem[];
  label?: string;
  button?: Partial<ButtonProps>;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={root} className="relative">
      <Button
        type="button"
        intent="white"
        variant="solid"
        size="medium"
        shape="pill"
        aria-haspopup="menu"
        aria-expanded={open}
        trailingIcon={<Icon size={20}>keyboard_arrow_down</Icon>}
        {...button}
        onClick={() => setOpen(!open)}
      >
        {label}
      </Button>
      {open ? (
        // As wide as the longest item ("Create A/P down payment invoice"), within 240–400px and the screen.
        <Dropdown role="menu" style={{ left: 'auto', right: 0, width: 'max-content', minWidth: 240, maxWidth: 'min(400px, calc(100vw - 32px))' }}>
          {items.map((item) => (
            <DropdownItem
              key={item.label}
              leadingIcon={<Icon size={20}>{item.icon}</Icon>}
              onSelect={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ) : null}
    </div>
  );
}
