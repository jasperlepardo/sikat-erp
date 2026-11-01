import { useState, type ReactNode } from 'react';
import { Icon, IconButton } from '@jasperlepardo/sikat-design-system';
import { AddFilterMenu } from './AddFilterMenu';
import { FilterChip } from './FilterChip';
import type { FilterField, FilterGroup, Rule } from './engine';

/**
 * The chip-first filter toolbar: the view selector, an "Add filter" field picker,
 * the active rules as editable chips, and reset / save-as-view actions once the
 * filter differs from the picked view.
 *
 * New filter UX — see `docs/list-filter-ux-plan.md`. Rendered by
 * `useListPresets().toolbar(search)`.
 */
export function FilterToolbar<T>({
  fields,
  value,
  onChange,
  viewMenu,
  edited,
  onReset,
  onSaveView,
  search,
}: {
  fields: FilterField<T>[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  /** The view ("All ▾") selector — reuses the preset menu. */
  viewMenu: ReactNode;
  /** The filter differs from the picked view — show reset / save. */
  edited: boolean;
  onReset: () => void;
  /** Open the save-as-view flow (names the current filter). */
  onSaveView: () => void;
  /** The free-text search field, shown above the toolbar row. */
  search?: ReactNode;
}) {
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  // Every rule pointing at a known field — including a just-added, still-empty one.
  const rules = value.rules.filter((r) => fields.some((f) => f.key === r.field));
  const updateRule = (next: Rule) => onChange({ ...value, rules: value.rules.map((r) => (r.id === next.id ? next : r)) });
  const removeRule = (id: string) => onChange({ ...value, rules: value.rules.filter((r) => r.id !== id) });

  return (
    <div className="flex flex-col gap-2">
      {search}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-subtle px-2 py-1.5">
        {viewMenu}
        {rules.map((rule) => {
          const field = fields.find((f) => f.key === rule.field);
          if (!field) return null;
          return (
            <FilterChip
              key={rule.id}
              field={field}
              rule={rule}
              onChange={updateRule}
              onRemove={() => removeRule(rule.id)}
              defaultOpen={rule.id === openRuleId}
            />
          );
        })}
        <AddFilterMenu fields={fields} value={value} onChange={onChange} onAdded={setOpenRuleId} />
        {edited ? (
          <div className="flex items-center gap-1">
            <IconButton label="Discard filter changes" intent="default" variant="ghost" size="small" onClick={onReset}>
              <Icon size={20}>undo</Icon>
            </IconButton>
            <IconButton label="Save as view" intent="default" variant="ghost" size="small" onClick={onSaveView}>
              <Icon size={20}>save</Icon>
            </IconButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
