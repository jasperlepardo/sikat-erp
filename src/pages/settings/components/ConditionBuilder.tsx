import { Button, Icon, IconButton, Select, Text } from '@jasperlepardo/sikat-design-system';
import type { SeriesCondition } from '../../../mocks/common';
import type { ConditionField } from '../../../services/allSeries';

export type { ConditionField };

interface Props {
  conditions: SeriesCondition[];
  fields: ConditionField[];
  onChange: (conditions: SeriesCondition[]) => void;
}

export function ConditionBuilder({ conditions, fields, onChange }: Props) {
  const update = (i: number, patch: Partial<SeriesCondition>) =>
    onChange(conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)));

  const remove = (i: number) => onChange(conditions.filter((_, n) => n !== i));

  const add = () => {
    const first = fields[0];
    if (!first) return;
    const opts = first.options();
    onChange([...conditions, { field: first.field, value: opts[0]?.value ?? '' }]);
  };

  const usedFields = new Set(conditions.map((c) => c.field));
  const availableToAdd = fields.filter((f) => !usedFields.has(f.field));

  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 && (
        <Text variant="small" tone="muted">No conditions — this series is not auto-selected. Mark it as default to use it as the fallback.</Text>
      )}
      {conditions.map((cond, i) => {
        const fieldDef = fields.find((f) => f.field === cond.field);
        const valueOptions = fieldDef?.options() ?? [];
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <Text variant="small" tone="muted" className="w-4 shrink-0 text-center">+</Text>}
            <Select
              aria-label="Condition field"
              className="w-36 shrink-0"
              options={fields.map((f) => ({ value: f.field, label: f.label }))}
              value={cond.field}
              onValueChange={(field) => {
                const def = fields.find((f) => f.field === field);
                const opts = def?.options() ?? [];
                update(i, { field, value: opts[0]?.value ?? '' });
              }}
            />
            <Text variant="small" tone="muted" className="shrink-0">=</Text>
            <Select
              aria-label="Condition value"
              className="min-w-0 flex-1"
              options={valueOptions}
              value={cond.value}
              onValueChange={(value) => update(i, { value })}
            />
            <IconButton type="button" label="Remove" size="small" shape="pill" intent="white" variant="ghost" onClick={() => remove(i)}>
              <Icon size={14}>close</Icon>
            </IconButton>
          </div>
        );
      })}
      {availableToAdd.length > 0 && (
        <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={14}>add</Icon>} onClick={add}>
          Add condition
        </Button>
      )}
    </div>
  );
}
