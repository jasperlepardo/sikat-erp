import { FieldStack, Section, bind } from '../../../components/form/fields';
import { activeOptions, type InventoryMasters } from '../../../services/inventoryMasters';

interface ReturnFields {
  shippingType: string;
}

interface Props {
  draft: ReturnFields;
  update: (patch: Partial<ReturnFields>) => void;
  readOnly: boolean;
  inv: InventoryMasters;
}

export function ReturnShipmentCard({ draft, update, readOnly, inv }: Props) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="route" title="Shipment">
        <FieldStack>
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
