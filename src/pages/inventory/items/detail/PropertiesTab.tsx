import { Button, Checkbox, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { PROPERTY_GROUPS } from '../../../../mocks/itemMasters';
import type { TabProps } from './types';

const ALL = PROPERTY_GROUPS.flatMap((g) => g.labels);

export function PropertiesTab({ draft, update }: TabProps) {
  const toggle = (label: string, on: boolean) =>
    update({ properties: ALL.filter((l) => (l === label ? on : draft.properties.includes(l))) });

  return (
    <Section
      icon="label"
      title="Properties"
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [...ALL] })}>
            Select all
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [] })}>
            Clear selection
          </Button>
        </div>
      }
    >
      <Text variant="small" tone="muted">
        Flags for filtering and reports; they don’t trigger anything by themselves. Admins rename them in Settings ›
        Inventory.
      </Text>
      {PROPERTY_GROUPS.map((g) => (
        <fieldset key={g.group} className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-heading">{g.group}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.labels.map((label) => (
              <Checkbox
                key={label}
                checked={draft.properties.includes(label)}
                onChange={(e) => toggle(label, e.currentTarget.checked)}
              >
                {label}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      ))}
    </Section>
  );
}
