import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Warehouse } from '../../../mocks/itemMasters';
import { listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { locationStock, stockColumns } from './locationStock';
import { WarehouseBins, type BinScope } from './WarehouseBins';

/**
 * The main column of a location's record page: its items and, for a warehouse, its bin
 * locations. Picking an aisle or shelf on Bin locations lists its items.
 */
export function WarehouseContents({ warehouse, isNew, base }: { warehouse: Warehouse; isNew: boolean; base: string }) {
  const navigate = useNavigate();
  const items = useAsync(listItems, []);
  const usesBins = warehouse.type === 'warehouse';
  const [tab, setTab] = useState<'items' | 'bins'>('items');
  const [scope, setScope] = useState<BinScope | null>(null);

  const rows = items ? locationStock(items, warehouse.code, scope?.bins) : [];
  const showItems = (s: BinScope) => {
    setScope(s);
    setTab('items');
  };

  return (
    <>
      {usesBins ? (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'items' | 'bins')}
          items={[
            { value: 'items', label: 'Items' },
            { value: 'bins', label: 'Bin locations' },
          ]}
        />
      ) : null}
      {tab === 'bins' && usesBins ? (
        <WarehouseBins warehouse={warehouse} isNew={isNew} base={base} onShowItems={showItems} />
      ) : (
        <DataTable
          variant="card"
          icon="inventory_2"
          title={`Items${rows.length ? ` (${rows.length})` : ''}`}
          description={
            usesBins ? 'Stock per item here. Per-bin quantities aren’t posted yet, so each item’s stock counts as sitting in its default bin.' : undefined
          }
          actions={
            scope ? (
              <Badge variant="outline" onDismiss={() => setScope(null)} dismissLabel={`Show all of ${warehouse.code}`}>
                {scope.label}
              </Badge>
            ) : undefined
          }
          rows={rows}
          columns={stockColumns((r) => navigate(`/inventory/items/${encodeURIComponent(r.id)}`), usesBins)}
          getRowId={(r) => r.id}
          empty={
            <Text variant="small" tone="muted">
              {items === undefined
                ? 'Loading…'
                : isNew
                  ? 'Save the location, then stock items here from each item’s Warehouses card.'
                  : scope
                    ? `No items have their default bin in ${scope.label}.`
                    : 'No items are stocked here yet. Add the location from an item’s Warehouses card.'}
            </Text>
          }
        />
      )}
    </>
  );
}
