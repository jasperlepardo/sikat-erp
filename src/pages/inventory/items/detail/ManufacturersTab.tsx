import { Button, Icon, Select, Table, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { MANUFACTURERS } from '../../../../mocks/itemMasters';
import { newManufacturerRow, type ItemManufacturer } from '../../../../mocks/items';
import type { TabProps } from './types';

const options = MANUFACTURERS.filter((m) => m.name).map((m) => ({ value: m.code, label: m.code }));

export function ManufacturersTab({ draft, update }: TabProps) {
  const rows = draft.manufacturers;
  const patch = (id: string, p: Partial<ItemManufacturer>) =>
    update({ manufacturers: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  const columns: TableColumn<ItemManufacturer>[] = [
    {
      key: 'code',
      header: 'Manufacturer',
      cell: (r) => (
        <Select
          aria-label="Manufacturer"
          options={options}
          placeholder="Pick a manufacturer"
          value={r.code === '— None —' ? '' : r.code}
          onValueChange={(code) => patch(r.id, { code })}
        />
      ),
    },
    {
      key: 'name',
      header: 'Manufacturer name',
      cell: (r) => MANUFACTURERS.find((m) => m.code === r.code)?.name || <span className="text-muted">—</span>,
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
      key: 'remove',
      header: 'Remove',
      srOnlyHeader: true,
      cell: (r) => (
        <Button
          type="button"
          size="small"
          variant="ghost"
          intent="danger"
          onClick={() => update({ manufacturers: rows.filter((x) => x.id !== r.id) })}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <Section
      icon="factory"
      title="Manufacturers"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="New manufacturer row"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => update({ manufacturers: [...rows, newManufacturerRow()] })}
        >
          New
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        Every manufacturer this item is sourced from. Names come from the manufacturer record.
      </Text>
      {rows.length ? (
        <Table caption="Manufacturers" columns={columns} rows={rows} getRowId={(r) => r.id} />
      ) : (
        <Text variant="small" tone="muted">
          No manufacturers linked.
        </Text>
      )}
    </Section>
  );
}
