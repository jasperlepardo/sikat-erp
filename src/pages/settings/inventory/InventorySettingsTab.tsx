import { useEffect, useState } from 'react';
import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../components/form/fields';
import { LENGTH_UNITS, WEIGHT_UNITS, volumeUnit, type InventorySettings } from '../../../mocks/itemMasters';
import { inventorySettings } from '../../../services/inventoryMasters';

/** Company-wide units for item dimensions and weights. */
export function InventorySettingsTab() {
  const [settings, setSettings] = useState<InventorySettings>();
  const [saved, setSaved] = useState<InventorySettings>();
  useEffect(() => {
    inventorySettings.list().then(([s]) => {
      setSettings(s);
      setSaved(s);
    });
  }, []);
  if (!settings) return <p className="p-4 text-muted">Loading…</p>;
  const f = bind(settings, (p) => setSettings({ ...settings, ...p }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  return (
    <Section
      icon="tune"
      title="Inventory settings"
      actions={
        <Button
          type="button"
          size="small"
          intent="primary"
          variant="solid"
          disabled={!dirty}
          onClick={async () => {
            const next = await inventorySettings.save(settings);
            setSettings(next);
            setSaved(next);
          }}
        >
          Save
        </Button>
      }
    >
      <Fields cols={3}>
        {f.pick('lengthUnit', 'Length unit', LENGTH_UNITS, { hint: `Item length, width and height. Volume is in ${volumeUnit(settings.lengthUnit)}.` })}
        {f.pick('weightUnit', 'Weight unit', WEIGHT_UNITS, { hint: 'Item net and gross weight.' })}
      </Fields>
      <Text variant="small" tone="muted">
        Changing a unit relabels the fields; it doesn’t convert values already entered on items.
      </Text>
    </Section>
  );
}
