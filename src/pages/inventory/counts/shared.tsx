import { useState } from 'react';
import { Button, Combobox, Icon, Select, TextField } from '@jasperlepardo/sikat-design-system';
import type { Item } from '../../../mocks/items';
import type { ItemGroup, Warehouse } from '../../../mocks/itemMasters';
import { warehouseOptions } from '../transfers/TransferLines';

export const COUNT_LIST_PATH = '/inventory/stock-counts';
export const POSTING_LIST_PATH = '/inventory/stock-counts/postings';

export interface CountMasters {
  items: Item[];
  warehouses: Warehouse[];
  groups: ItemGroup[];
}

export const num = (v: string) => (v === '' ? 0 : Number(v));

/** Current time as HH:MM in Manila, for Time fields that default to now. */
export const nowHHMM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

/** The units an item can be counted in: inventory unit first, then its other units. */
export const uomOptions = (item: Item | undefined) =>
  item
    ? [
        { value: item.inventoryUom, label: `${item.inventoryUom} (1)` },
        ...item.uoms.filter((u) => u.uom !== item.inventoryUom && u.qty > 0).map((u) => ({ value: u.uom, label: `${u.uom} (${u.qty})` })),
      ]
    : [];

export const itemsPer = (item: Item | undefined, uom: string) =>
  !item || uom === item.inventoryUom ? 1 : (item.uoms.find((u) => u.uom === uom)?.qty ?? 1);

/** Item picker options for count and posting lines: inventory items only. */
export const itemOptions = (items: Item[], current: string) =>
  items
    .filter((i) => i.id === current || i.inventoryItem)
    .map((i) => ({
      value: i.id,
      label: (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs opacity-60">{i.itemNo}</span>
          <span>{i.name}</span>
        </div>
      ),
      text: `${i.itemNo} ${i.name} ${i.description}`,
    }));

/**
 * Add Items: every item stocked in a warehouse (optionally one item group) that isn't on the
 * document yet, as SAP's selection-criteria window does.
 */
export function AddItemsBar({
  m,
  listed,
  onAdd,
}: {
  m: CountMasters;
  /** "itemId@warehouse" already on the document. */
  listed: Set<string>;
  onAdd: (items: Item[], warehouse: string) => void;
}) {
  const [wh, setWh] = useState('');
  const [group, setGroup] = useState('');
  const matching = wh
    ? m.items
        .filter(
          (i) =>
            i.inventoryItem &&
            (!group || i.itemGroupId === group) &&
            i.warehouses.some((w) => w.code === wh && w.inStock > 0) &&
            !listed.has(`${i.id}@${wh}`),
        )
        .sort((a, b) => a.itemNo.localeCompare(b.itemNo))
    : [];
  return (
    <div className="flex flex-wrap items-end gap-1">
      <div className="w-64">
        <Combobox aria-label="Warehouse for Add Items" placeholder="Add items from warehouse…" options={warehouseOptions(m.warehouses, wh)} value={wh || null} onValueChange={(v) => setWh(v ?? '')} />
      </div>
      <Select
        aria-label="Item group for Add Items"
        className="w-48"
        options={[{ value: '', label: 'All item groups' }, ...m.groups.map((g) => ({ value: g.id, label: g.name }))]}
        value={group}
        onValueChange={setGroup}
      />
      <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>playlist_add</Icon>} disabled={!matching.length} onClick={() => onAdd(matching, wh)}>
        {wh ? `Add ${matching.length} stocked item${matching.length === 1 ? '' : 's'}` : 'Add items'}
      </Button>
    </div>
  );
}

/** Find: narrow the grid to an item no. and/or warehouse. */
export function FindBar({
  m,
  query,
  warehouse,
  onChange,
}: {
  m: CountMasters;
  query: string;
  warehouse: string;
  onChange: (query: string, warehouse: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-1">
      <TextField
        aria-label="Find item no."
        placeholder="Find item no."
        leadingIcon={<Icon size={16}>search</Icon>}
        className="w-56"
        value={query}
        onChange={(e) => onChange(e.currentTarget.value, warehouse)}
      />
      <div className="w-56">
        <Combobox
          aria-label="Find warehouse"
          placeholder="All warehouses"
          options={warehouseOptions(m.warehouses, warehouse)}
          value={warehouse || null}
          onValueChange={(v) => onChange(query, v ?? '')}
        />
      </div>
    </div>
  );
}

/** Rows matching the Find bar. */
export const findRows = <T extends { itemNo: string; description: string; warehouse: string }>(rows: T[], query: string, warehouse: string) => {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (!warehouse || r.warehouse === warehouse) && (!q || `${r.itemNo} ${r.description}`.toLowerCase().includes(q) || !r.itemNo));
};

/** Signed quantity, e.g. "+2" / "−1" / "0". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
