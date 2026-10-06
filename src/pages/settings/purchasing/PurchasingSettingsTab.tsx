import { useEffect, useState } from 'react';
import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import type { PurchasingSettings } from '../../../mocks/purchaseOrders';
import { purchasingSettings } from '../../../services/purchaseOrders';

const ROUNDING_METHODS = ['By Currency', 'No rounding'] as const;
const DUP_VENDOR_REF = ['Allow', 'Warn', 'Block'] as const;

export function PurchasingSettingsTab() {
  const [settings, setSettings] = useState<PurchasingSettings>();
  const [saved, setSaved] = useState<PurchasingSettings>();

  useEffect(() => {
    purchasingSettings.list().then(([s]) => {
      setSettings(s);
      setSaved(s);
    });
  }, []);

  if (!settings) return <Text tone="muted" className="p-4">Loading…</Text>;

  const f = bind(settings, (p) => setSettings({ ...settings, ...p }));
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-6 col-start-4 flex flex-col gap-2">
    <Section
      icon="tune"
      title="Purchasing settings"
      actions={
        <Button
          type="button"
          size="small"
          intent="primary"
          variant="solid"
          disabled={!dirty}
          onClick={async () => {
            const next = await purchasingSettings.save(settings);
            setSettings(next);
            setSaved(next);
          }}
        >
          Save
        </Button>
      }
    >
      <FieldStack>
        {f.pick('duplicateVendorRef', 'Duplicate vendor reference', [...DUP_VENDOR_REF], {
          hint: 'What to do when another open PO from the same vendor already has the same Vendor Ref. No.',
        })}
        {f.pick('roundingMethod', 'Rounding method', [...ROUNDING_METHODS], {
          hint: '"By Currency" shows a rounding row in the PO footer using the document currency\'s rounding rule.',
        })}
        {f.check('separateNetGrossPriceMode', 'Show separate Net / Gross price modes')}
        {f.check('manageFreightInDocuments', 'Manage freight on documents')}
        {f.check('multiLanguageSupport', 'Multi-language support')}
        {f.check('useBpCatalogNumbers', "Use vendor catalog numbers on lines")}
      </FieldStack>
    </Section>
      </div>
    </div>
  );
}
