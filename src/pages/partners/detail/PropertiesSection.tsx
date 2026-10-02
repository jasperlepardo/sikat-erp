import { useState } from 'react';
import { Button, Checkbox, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { QuickAddPanel, useCollection } from '../../../components/form/MasterLookup';
import type { NamedEntry } from '../../../mocks/partnerMasters';
import { partnerPropertyDef } from '../../settings/masterDefs';
import { Section, type TabProps } from './fields';

export function PropertiesSection({ draft, update }: TabProps) {
  const rows = useCollection(partnerPropertyDef.collection);
  const [adding, setAdding] = useState<NamedEntry | null>(null);
  // Active properties, plus any inactive one this partner still has.
  const labels = (rows ?? []).filter((p) => p.active || draft.properties.includes(p.name)).map((p) => p.name);
  const toggle = (label: string, on: boolean) =>
    update({ properties: labels.filter((l) => (l === label ? on : draft.properties.includes(l))) });

  return (
    <Section
      icon="label"
      title="Properties"
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [...labels] })}>
            Select all
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => update({ properties: [] })}>
            Clear selection
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={() => setAdding(partnerPropertyDef.blank(''))}
          >
            New property
          </Button>
        </div>
      }
    >
      <Text variant="small" tone="muted">
        Tags for filtering reports and marketing lists. Admins rename them in Settings › Sales &amp; CRM › Partner properties.
      </Text>
      {rows && !labels.length ? (
        <Text variant="small" tone="muted">
          No properties yet. Add one with New property.
        </Text>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((label) => (
          <Checkbox
            key={label}
            checked={draft.properties.includes(label)}
            onChange={(e) => toggle(label, e.currentTarget.checked)}
          >
            {label}
          </Checkbox>
        ))}
      </div>
      {adding ? (
        <QuickAddPanel
          def={partnerPropertyDef}
          initial={adding}
          onCancel={() => setAdding(null)}
          onSaved={(row) => {
            setAdding(null);
            update({ properties: [...draft.properties, row.name] });
          }}
        />
      ) : null}
    </Section>
  );
}
