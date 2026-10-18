import { Text } from '@jasperlepardo/sikat-design-system';
import { DocumentFlow } from '../../../shared/DocumentFlow';

export function DocumentsCard({ pbaId }: { pbaId: string | undefined }) {
  if (!pbaId) {
    return (
      <Text tone="muted" variant="small" className="p-4">
        Save the agreement first to see linked documents.
      </Text>
    );
  }

  return (
    <DocumentFlow
      kind="PBA"
      id={pbaId}
      notes="Purchase orders and their downstream documents drawn from this agreement."
    />
  );
}
