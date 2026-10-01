import { Dropdown, DropdownItem, Icon, IconButton, Link, useDropdown } from '@jasperlepardo/sikat-design-system';

export interface RowMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A row's "⋯" actions (e.g. on a List.Card). Portaled, so it isn't clipped by the list.
 * With `text`, the trigger is a "+ text" link instead (e.g. a card's "Add ▾" menu).
 */
export function RowMenu({ label, items, text }: { label: string; items: RowMenuItem[]; text?: string }) {
  const { open, toggle, setOpen, rootRef, panelRef, anchor, side, hSide } = useDropdown();
  return (
    <div ref={rootRef}>
      {text ? (
        <Link
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          leadingIcon={<Icon size={20}>add</Icon>}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {text}
        </Link>
      ) : (
        <IconButton
          intent="default"
          variant="link"
          size="small"
          label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <Icon size={20}>more_vert</Icon>
        </IconButton>
      )}
      {open ? (
        <Dropdown ref={panelRef} role="menu" anchor={anchor} side={side} hSide={hSide} style={{ width: 220 }}>
          {items.map((item) => (
            <DropdownItem
              key={item.label}
              leadingIcon={<Icon size={20}>{item.icon}</Icon>}
              disabled={item.disabled}
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
