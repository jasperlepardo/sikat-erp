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
  const shown = (rows ?? []).filter((p) => p.active || draft.propertyIds.includes(p.id));
  const toggle = (id: string, on: boolean) =>
    update({ propertyIds: shown.map((p) => p.id).filter((x) => (x === id ? on : draft.propertyIds.includes(x))) });

  return (
    <Section
      icon="label"
      title="Properties"
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" onClick={() => update({ propertyIds: shown.map((p) => p.id) })}>
            Select all
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={() => update({ propertyIds: [] })}>
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
      {rows && !shown.length ? (
        <Text variant="small" tone="muted">
          No properties yet. Add one with New property.
        </Text>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <Checkbox
            key={p.id}
            checked={draft.propertyIds.includes(p.id)}
            onChange={(e) => toggle(p.id, e.currentTarget.checked)}
          >
            {p.name}
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
            update({ propertyIds: [...draft.propertyIds, row.id] });
          }}
        />
      ) : null}
    </Section>
  );
}
