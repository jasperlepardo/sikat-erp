import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { PoTabProps } from './types';

export function PoDeliveryCard({ draft, update, m, ctx }: PoTabProps) {
  const f = bind(draft, update);
  const warehouses = [...new Set(draft.lines.map((l) => l.warehouse).filter(Boolean))];
  return (
    <Section icon="route" title="Delivery">
      <FieldStack>
        {f.lookup(
          'shippingType',
          'Shipping type',
          activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType),
          { clearable: true, hint: 'Defaults from the vendor.' },
        )}
        {getPurchasingSettings().multiLanguageSupport
          ? f.pick('language', 'Language', LANGUAGES, { hint: "Prints the PO in the vendor's language." })
          : null}
      </FieldStack>
      <Flags>
        {f.check('splitByWarehouse', 'Split purchase order', { disabled: ctx.added })}
        {f.check('approved', 'Approved')}
      </Flags>
      <Text variant="small" tone="muted" className="mt-2">
        {ctx.added
          ? 'Split applies when a PO is added.'
          : draft.splitByWarehouse && warehouses.length > 1
            ? `Adding creates ${warehouses.length} POs, one per warehouse (${warehouses.join(', ')}).`
            : 'Split purchase order creates one PO per warehouse when lines go to several.'}{' '}
        Unapproved POs are saved as Not Confirmed and cannot be received until approved.
      </Text>
    </Section>
  );
}
