import { Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';

export function DocumentsTab() {
  return (
    <Section icon="receipt_long" title="Linked Documents">
      <Text tone="muted" variant="small">
        Documents drawn against this agreement — Sales Orders, Deliveries and Invoices — will appear here once the agreement is referenced on a transaction.
      </Text>
    </Section>
  );
}
