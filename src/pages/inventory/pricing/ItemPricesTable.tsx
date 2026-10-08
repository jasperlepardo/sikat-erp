import { useState } from 'react';
import { Checkbox, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Item } from '../../../mocks/items';
import type { PriceList } from '../../../mocks/partnerMasters';
import { formatAmount } from '../../../services/format';
import { itemGroupName } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { priceLists } from '../../../services/partnerMasters';
import { calculatedItemPrice } from '../../../services/priceLists';
import { useAsync } from '../../../services/useAsync';

interface Row {
  item: Item;
  calculated: number | undefined;
  manual: number | undefined;
}

/**
 * A price list's item prices. Each item shows what the list calculates; ticking Manual sets a
 * price of its own, which dependent lists further down the chain then build on.
 */
export function ItemPricesTable({ list, update }: { list: PriceList; update: (patch: Partial<PriceList>) => void }) {
  const items = useAsync(listItems, []);
  const [query, setQuery] = useState('');
  const all = priceLists.snapshot();

  const setManual = (itemId: string, price: number | undefined) =>
    update({
      itemPrices:
        price === undefined
          ? list.itemPrices.filter((p) => p.itemId !== itemId)
          : list.itemPrices.some((p) => p.itemId === itemId)
            ? list.itemPrices.map((p) => (p.itemId === itemId ? { ...p, price } : p))
            : [...list.itemPrices, { itemId, price }],
    });

  const q = query.trim().toLowerCase();
  const rows: Row[] = (items ?? [])
    .filter((i) => !q || `${i.itemNo} ${i.name} ${itemGroupName(i.itemGroupId)}`.toLowerCase().includes(q))
    .map((item) => ({
      item,
      calculated: calculatedItemPrice(list, item, all),
      manual: list.itemPrices.find((p) => p.itemId === item.id)?.price,
    }));

  return (
    <DataTable<Row>
      icon="price_change"
      title="Item prices"
      description={`PHP per inventory unit, ${list.gross ? 'VAT inclusive' : 'net of VAT'}. Tick Manual to set an item's price by hand; the rest follow the list's ${list.basePriceListId ? 'base and factor' : 'item ' + (list.source === 'cost' ? 'cost' : 'SRP')}.`}
      rows={rows}
      getRowId={(r) => r.item.id}
      sortValue={(r, key) =>
        key === 'price' ? (r.manual ?? r.calculated ?? 0) : key === 'manual' ? Number(r.manual !== undefined) : key === 'itemGroupId' ? itemGroupName(r.item.itemGroupId) : r.item.itemNo
      }
      actions={<TextField aria-label="Find item" placeholder="Find item or group" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />}
      columns={[
        {
          key: 'itemNo',
          header: 'Item',
          cell: (r) => (
            <div className="flex flex-col">
              <span>{r.item.itemNo}</span>
              <Text variant="small" tone="muted">{r.item.name}</Text>
            </div>
          ),
        },
        { key: 'itemGroupId', header: 'Item group', cell: (r) => itemGroupName(r.item.itemGroupId) },
        { key: 'uom', header: 'Unit', cell: (r) => r.item.inventoryUom, sortable: false },
        {
          key: 'calculated',
          header: 'Calculated',
          cell: (r) => (r.calculated === undefined ? '—' : formatAmount(r.calculated)),
          sortable: false,
        },
        {
          key: 'manual',
          header: 'Manual',
          cell: (r) => (
            <Checkbox
              aria-label={`Manual price for ${r.item.itemNo}`}
              checked={r.manual !== undefined}
              onChange={(e) => setManual(r.item.id, e.currentTarget.checked ? (r.calculated ?? 0) : undefined)}
            />
          ),
        },
        {
          key: 'price',
          header: 'Unit price',
          cell: (r) =>
            r.manual === undefined ? (
              <span>{r.calculated === undefined ? '—' : formatAmount(r.calculated)}</span>
            ) : (
              <TextField
                aria-label={`Unit price for ${r.item.itemNo}`}
                type="number"
                min={0}
                prefix="PHP"
                className="w-40"
                value={String(r.manual)}
                onChange={(e) => setManual(r.item.id, Number(e.currentTarget.value) || 0)}
              />
            ),
        },
      ]}
      empty={
        <Text variant="small" tone="muted">
          {items ? 'No items match.' : 'Loading items…'}
        </Text>
      }
    />
  );
}
