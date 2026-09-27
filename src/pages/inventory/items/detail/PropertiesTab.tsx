import { Button, Checkbox, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import type { TabProps } from './types';

export function PropertiesTab({ draft, update, inv }: TabProps) {
  // Active properties, plus any inactive ones still ticked on this item.
  const shown = inv.properties.filter((p) => p.active || draft.properties.includes(p.id));
  const groups = [...new Set(shown.map((p) => p.group))];
  const toggle = (id: string, on: boolean) =>
    update({ properties: inv.properties.filter((p) => (p.id === id ? on : draft.properties.includes(p.id))).map((p) => p.id) });

  return (
    <Section
      icon="label"
      title="Properties"
      actions={
        <div className="flex gap-1">
          <Button
            type="button"
            size="small"
            variant="ghost"
            onClick={() => update({ properties: shown.filter((p) => p.active).map((p) => p.id) })}
          >
            Select all
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [] })}>
            Clear selection
          </Button>
        </div>
      }
    >
      <Text variant="small" tone="muted">
        Flags for filtering and reports; they don’t trigger anything by themselves. Admins name up to 64 of them in
        Settings › Inventory › Item properties.
      </Text>
      {groups.map((g) => (
        <fieldset key={g} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-heading">{g || 'Ungrouped'}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shown
              .filter((p) => p.group === g)
              .map((p) => (
                <Checkbox
                  key={p.id}
                  checked={draft.properties.includes(p.id)}
                  onChange={(e) => toggle(p.id, e.currentTarget.checked)}
                >
                  {p.number}. {p.name}
                  {!p.active ? <span className="text-muted"> (inactive)</span> : null}
                </Checkbox>
              ))}
          </div>
        </fieldset>
      ))}
    </Section>
  );
}
