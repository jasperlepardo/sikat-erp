import { Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import type { PoDraft } from './types';

export function PoDeliveryTab({ draft }: { draft: PoDraft }) {
  return (
    <DataTable
      noPagination
      rows={draft.lines.filter((l) => !!l.itemId)}
      getRowId={(l) => l.id}
      unsortable={['item', 'ordered', 'received', 'balance']}
      empty={<Text variant="small" tone="muted">No lines yet.</Text>}
      columns={[
        {
          key: 'item',
          header: 'Item / Description',
          cell: (l) => (
            <div className="flex flex-col">
              <Text variant="caption">{l.itemNo}</Text>
              <Text variant="small">{l.description || l.name}</Text>
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
          key: 'received',
          header: 'Received',
          align: 'end' as const,
          cell: (l) => (
            <Text variant="small" className="whitespace-nowrap tabular-nums">
              {l.receivedQty ? `${l.receivedQty.toLocaleString('en-PH')} ${l.uomCode}` : '—'}
            </Text>
          ),
        },
        {
          key: 'balance',
          header: 'Open qty',
          align: 'end' as const,
          cell: (l) => {
            const balance = l.quantity - l.receivedQty;
            return (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {balance > 0 ? `${balance.toLocaleString('en-PH')} ${l.uomCode}` : '—'}
              </Text>
            );
          },
        },
      ]}
    />
  );
}
