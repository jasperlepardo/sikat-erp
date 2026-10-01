import { Button, Checkbox, Text } from '@jasperlepardo/sikat-design-system';
import { PROPERTY_LABELS } from '../../../mocks/masters';
import { Section, type TabProps } from './fields';

export function PropertiesSection({ draft, update }: TabProps) {
  const toggle = (label: string, on: boolean) =>
    update({ properties: PROPERTY_LABELS.filter((l) => (l === label ? on : draft.properties.includes(l))) });

  return (
    <Section
      icon="label"
      title="Properties"
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [...PROPERTY_LABELS] })}>
            Select all
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [] })}>
            Clear selection
          </Button>
        </div>
      }
    >
      <Text variant="small" tone="muted">
        Tags for filtering reports and marketing lists. Admins rename them in Settings › Sales &amp; CRM.
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROPERTY_LABELS.map((label) => (
          <Checkbox
            key={label}
            checked={draft.properties.includes(label)}
            onChange={(e) => toggle(label, e.currentTarget.checked)}
          >
            {label}
          </Checkbox>
        ))}
      </div>
    </Section>
  );
}
