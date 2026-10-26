import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import type { PoMasters } from '../../purchase-orders/detail/types';
import type { GrDraft } from './types';

type LogisticsDraft = Pick<GrDraft, 'shippingType' | 'language'>;

export function GrLogistics({
  draft,
  update,
  m,
}: {
  draft: LogisticsDraft;
  update: (patch: Partial<LogisticsDraft>) => void;
  m: PoMasters;
}) {
  const f = bind(draft, update);
  return (
    <Section icon="local_shipping" title="Logistics">
      <FieldStack>
        {f.lookup(
          'shippingType',
          'Shipping type',
          activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType),
          { clearable: true, hint: 'Defaults from the vendor or the PO.' },
        )}
        {getPurchasingSettings().multiLanguageSupport ? f.pick('language', 'Language', LANGUAGES, { hint: 'Language the receipt prints in.' }) : null}
      </FieldStack>
    </Section>
  );
}
