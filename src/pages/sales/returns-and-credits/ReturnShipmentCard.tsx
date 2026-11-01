import { FieldOrientationCtx, Form, Section, bind } from '../../../components/form/fields';
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
    <Section icon="route" title="Shipment">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {h.lookup('shippingType', 'Shipping type', activeOptions(inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
