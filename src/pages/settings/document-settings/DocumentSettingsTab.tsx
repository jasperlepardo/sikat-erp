import { useEffect, useState } from 'react';
import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import type { DocumentSettings } from '../../../mocks/documentSettings';
import { documentSettings } from '../../../services/documentSettings';

/** Settings › Document settings — company-wide document behavior shared by sales and purchasing. */
export function DocumentSettingsTab() {
  const [settings, setSettings] = useState<DocumentSettings>();
  const [saved, setSaved] = useState<DocumentSettings>();

  useEffect(() => {
    documentSettings.list().then(([s]) => {
      setSettings(s);
      setSaved(s);
    });
  }, []);

  if (!settings) return <Text tone="muted" className="p-4">Loading…</Text>;

  const f = bind(settings, (p) => setSettings({ ...settings, ...p }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-8 col-start-3 flex flex-col gap-2">
        <Section
          icon="tune"
          title="Document settings"
          actions={
            <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty}
              onClick={async () => {
                const next = await documentSettings.save(settings);
                setSettings(next);
                setSaved(next);
              }}
            >
              Save
            </Button>
          }
        >
          <FieldStack>
            {f.check('separateNetGrossPriceMode', 'Show Net / Gross price-entry modes on documents')}
          </FieldStack>
          <Text variant="small" tone="muted" className="mt-1">
            Lets you enter line prices VAT-exclusive (net), VAT-inclusive (gross), or both on sales and
            purchasing documents. Display only — the stored unit price is always net.
          </Text>
        </Section>
      </div>
    </div>
  );
}
