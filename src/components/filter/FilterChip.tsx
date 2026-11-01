import { useEffect } from 'react';
import { Chip, ChipGroup, Dropdown, useDropdown } from '@jasperlepardo/sikat-design-system';
import { describeRule, describeRuleParts, valueArity, type FilterField, type Rule } from './engine';
import { FilterValueEditor } from './FilterValueEditor';

/**
 * One filter rule as a segmented filter token (design system `ChipGroup`): a
 * "field + operator" label ("Category is") paired with a primary value `Chip`
 * ("Laptops"). Clicking the value chip opens the popover editor (operator +
 * value); the chip's × removes the rule. Parts come from `describeRuleParts`, so
 * the token updates live. When the operator takes no value ("is empty"), the whole
 * condition is a single neutral chip.
 *
 * See `docs/list-filter-ux-plan.md`.
 */
export function FilterChip<T>({
  field,
  rule,
  onChange,
  onRemove,
  defaultOpen = false,
}: {
  field: FilterField<T>;
  rule: Rule;
  onChange: (rule: Rule) => void;
  onRemove: () => void;
  /** Open the editor immediately — used when the chip was just added. */
  defaultOpen?: boolean;
}) {
  const { open, setOpen, toggle, rootRef, panelRef, anchor, side, hSide } = useDropdown();

  // Open once when the chip is first added. `setOpen` from useDropdown is a fresh
  // function every render and re-measures the anchor on each call, so depending on
  // it here would re-fire forever (Maximum update depth exceeded). Key on the
  // `defaultOpen` edge only.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen]);

  const { label, value } = describeRuleParts(rule, [field]);
  const full = describeRule(rule, [field]);
  // Show the value pill only once something is picked; a just-added rule is a single
  // "Status is" chip (click to pick) until then.
  const wantsValue = valueArity(rule.op) > 0 && value !== '';
  const removeLabel = `Remove filter: ${full}`;

  return (
    <div ref={rootRef} className="relative inline-flex">
      {wantsValue ? (
        <ChipGroup joined shape="rounded">
          <Chip intent="default" size="small" selected={open} onSelect={toggle}>
            {label}
          </Chip>
          <Chip intent="primary" size="small" selected={open} onSelect={toggle} onRemove={onRemove} removeLabel={removeLabel}>
            {value}
          </Chip>
        </ChipGroup>
      ) : (
        <Chip intent="default" size="small" selected={open} onSelect={toggle} onRemove={onRemove} removeLabel={removeLabel}>
          {label}
        </Chip>
      )}
      {open && anchor ? (
        <Dropdown ref={panelRef} role="menu" anchor={anchor} side={side} hSide={hSide} style={{ width: 280 }}>
          <FilterValueEditor field={field} rule={rule} onChange={onChange} />
        </Dropdown>
      ) : null}
    </div>
  );
}
