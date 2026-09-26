import { Button, Icon, Select, Table, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { newBarcodeRow, type ItemBarcode } from '../../../../mocks/items';
import type { TabProps } from './types';

export function BarcodesTab({ draft, update, errors }: TabProps) {
  const rows = draft.barcodes;
  // The item's own units: inventory, purchasing and sales.
  const uoms = [...new Set([draft.inventoryUom, draft.purchasingUom, draft.salesUom])];
  const patch = (id: string, p: Partial<ItemBarcode>) =>
    update({ barcodes: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const err = (r: ItemBarcode, field: string) => errors[`barcode:${r.id}:${field}`];

  const columns: TableColumn<ItemBarcode>[] = [
    {
      key: 'uom',
      header: 'UoM',
      cell: (r) => (
        <Select
          aria-label="Unit of measure"
          options={uoms.map((u) => ({ value: u, label: u }))}
          invalid={!!err(r, 'uom')}
          value={r.uom}
          onValueChange={(uom) => patch(r.id, { uom })}
        />
      ),
    },
    {
      key: 'barcode',
      header: 'Barcode',
      cell: (r) => (
        <div>
          <TextField
            aria-label="Barcode"
            placeholder="EAN-13, UPC-A, Code 128…"
            invalid={!!err(r, 'barcode')}
            value={r.barcode}
            onChange={(e) => patch(r.id, { barcode: e.currentTarget.value.trim() })}
          />
          {err(r, 'barcode') ? <p className="mt-1 text-xs text-danger">{err(r, 'barcode')}</p> : null}
        </div>
      ),
    },
    {
      key: 'freeText',
      header: 'Free text',
      cell: (r) => (
        <TextField
          aria-label="Free text"
          placeholder="e.g. EAN-13 — supplier label"
          value={r.freeText}
          onChange={(e) => patch(r.id, { freeText: e.currentTarget.value })}
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
          onClick={() => update({ barcodes: rows.filter((x) => x.id !== r.id) })}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <Section
      icon="barcode"
      title="Barcodes"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="New barcode"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => update({ barcodes: [...rows, newBarcodeRow(draft.inventoryUom)] })}
        >
          New
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        One barcode per packaging unit, so scanning a box or a carton finds the right quantity. Barcodes must be unique
        across all items.
      </Text>
      {errors.barcodes ? (
        <Text variant="small" tone="danger">
          {errors.barcodes}
        </Text>
      ) : null}
      {rows.length ? (
        <Table caption="Barcodes" columns={columns} rows={rows} getRowId={(r) => r.id} />
      ) : (
        <Text variant="small" tone="muted">
          No barcodes. {draft.gtin ? `The GTIN on the General tab (${draft.gtin}) still scans.` : ''}
        </Text>
      )}
    </Section>
  );
}
