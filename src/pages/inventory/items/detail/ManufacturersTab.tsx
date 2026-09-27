import { Badge, Button, Icon, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { newManufacturerRow, type ItemManufacturer } from '../../../../mocks/items';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { TabProps } from './types';

/**
 * Every manufacturer the item is sourced from. The main one is the Manufacturer
 * on the Purchasing tab — the two stay in sync.
 */
export function ManufacturersTab({ draft, update, inv }: TabProps) {
  const rows = draft.manufacturers;
  const master = (code: string) => inv.manufacturers.find((m) => m.code === code);
  const patch = (id: string, p: Partial<ItemManufacturer>) => {
    const row = rows.find((r) => r.id === id)!;
    const next = rows.map((r) => (r.id === id ? { ...r, ...p } : r));
    // Changing the main row's manufacturer changes the Purchasing manufacturer too.
    update({
      manufacturers: next,
      ...(p.code !== undefined && row.code === draft.manufacturer ? { manufacturer: p.code } : {}),
    });
  };
  const remove = (picked: ItemManufacturer[]) =>
    update({
      manufacturers: rows.filter((r) => !picked.includes(r)),
      ...(picked.some((r) => r.code === draft.manufacturer) ? { manufacturer: '' } : {}),
    });

  const columns: TableColumn<ItemManufacturer>[] = [
    {
      key: 'code',
      header: 'Manufacturer',
      cell: (r) => (
        <Select
          aria-label="Manufacturer"
          options={activeOptions(inv.manufacturers, (m) => m.code, (m) => m.code, r.code)}
          placeholder="Pick a manufacturer"
          value={r.code}
          onValueChange={(code) => patch(r.id, { code })}
        />
      ),
    },
    {
      key: 'name',
      header: 'Manufacturer name',
      cell: (r) => {
        const m = master(r.code);
        return m ? (
          <span>
            {m.name} <span className="text-muted">· {m.country}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: 'catalogNo',
      header: "Manufacturer's catalog no.",
      cell: (r) => (
        <TextField
          aria-label="Manufacturer's catalog no."
          value={r.catalogNo}
          onChange={(e) => patch(r.id, { catalogNo: e.currentTarget.value })}
        />
      ),
    },
    {
      key: 'main',
      header: 'Main',
      cell: (r) =>
        r.code && r.code === draft.manufacturer ? (
          <Badge intent="primary">Main</Badge>
        ) : (
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={!r.code}
            onClick={() => update({ manufacturer: r.code })}
          >
            Set as main
          </Button>
        ),
    },
  ];

  return (
    <DataTable
      icon="factory"
      title="Manufacturers"
      description="Every manufacturer this item is sourced from. Names come from the manufacturer record (Settings › Inventory). The main one is the Manufacturer on the Purchasing tab."
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      unsortable={['catalogNo', 'main']}
      sortValue={(r, key) => (key === 'name' ? (master(r.code)?.name ?? '') : String(r[key as keyof ItemManufacturer] ?? ''))}
      onRemove={remove}
      actions={
        <Button
          type="button"
          size="small"
          intent="primary"
          variant="solid"
          aria-label="New manufacturer row"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => update({ manufacturers: [...rows, newManufacturerRow()] })}
        >
          New
        </Button>
      }
      empty={
        <Text variant="small" tone="muted">
          No manufacturers linked.
        </Text>
      }
    />
  );
}
