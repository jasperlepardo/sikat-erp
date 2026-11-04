import { Button, Dropdown, DropdownItem, Icon, useDropdown } from '@jasperlepardo/sikat-design-system';
import { newRule, type FilterField, type FilterGroup } from './engine';

/**
 * The "⊕ Add Filter" button: a menu of the list's fields. Picking one appends a
 * fresh rule (its type's default operator) and reports the new rule id so the
 * caller can open that chip's editor straight away.
 *
 * New chip-first filter UX — see `docs/list-filter-ux-plan.md`.
 */
export function AddFilterMenu<T>({
  fields,
  value,
  onChange,
  onAdded,
}: {
  fields: FilterField<T>[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  /** The id of the just-added rule — open its chip editor. */
  onAdded?: (ruleId: string) => void;
}) {
  const { open, setOpen, toggle, rootRef, panelRef, anchor, side, hSide } = useDropdown();

  const add = (field: FilterField<T>) => {
    const rule = newRule(field);
    onChange({ ...value, rules: [...value.rules, rule] });
    setOpen(false);
    onAdded?.(rule.id);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <Button
        type="button"
        intent="default"
        variant="ghost"
        size="small"
        leadingIcon={<Icon size={20}>add_circle</Icon>}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        Add Filter
      </Button>
      {open && anchor ? (
        <Dropdown ref={panelRef} role="menu" anchor={anchor} side={side} hSide={hSide} style={{ width: 240 }}>
          {fields.map((field) => (
            <DropdownItem key={field.key} onSelect={() => add(field)}>
              {field.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ) : null}
    </div>
  );
}
