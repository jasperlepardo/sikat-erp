import { Dropdown, DropdownItem, Icon, IconButton, Link, useDropdown, type IconButtonProps } from '@jasperlepardo/sikat-design-system';

export interface RowMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A row's "⋯" actions (e.g. on a List.Card). Portaled, so it isn't clipped by the list.
 * With `text`, the trigger is a "+ text" link instead (e.g. a card's "Add ▾" menu). In a table's
 * actions column pass `size="2xs"`, the smallest icon button.
 */
export function RowMenu({ label, items, text, size = 'small' }: { label: string; items: RowMenuItem[]; text?: string; size?: IconButtonProps['size'] }) {
  const { open, toggle, setOpen, rootRef, panelRef, anchor, side, hSide } = useDropdown();
  return (
    // Hugs its trigger, so a table cell or card slot sizes to the button, not the space around it.
    <div ref={rootRef} className="row-actions inline-flex">
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
          size={size}
          label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <Icon size={size === '2xs' ? 16 : 20}>more_vert</Icon>
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
