import { Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { SoDraft } from './types';

export function DeliverySubTab({ draft }: { draft: SoDraft }) {
  return (
    <DataTable
      variant="plain"
      noPagination
      rows={draft.lines.filter((l) => !!l.itemId)}
      getRowId={(l) => l.id}
      unsortable={['item', 'ordered', 'delivered']}
      empty={<Text variant="small" tone="muted">No deliveries yet.</Text>}
      columns={[
        {
          key: 'item',
          header: 'Item / Description',
          cell: (l) => (
            <div className="flex flex-col">
              <Text variant="caption">{l.itemNo}</Text>
              <Text variant="small">{l.description}</Text>
            </div>
          ),
        },
        {
          key: 'ordered',
          header: 'Ordered',
          align: 'end' as const,
          cell: (l) => (
            <Text variant="small" className="whitespace-nowrap tabular-nums">
              {l.quantity.toLocaleString('en-PH')} {l.uomCode}
            </Text>
          ),
        },
        {
          key: 'delivered',
          header: 'Delivered',
          align: 'end' as const,
          cell: (l) => (
            <Text variant="small" className="whitespace-nowrap tabular-nums">
              {l.deliveredQty ? `${l.deliveredQty.toLocaleString('en-PH')} ${l.uomCode}` : '—'}
            </Text>
          ),
        },
      ]}
    />
  );
}
