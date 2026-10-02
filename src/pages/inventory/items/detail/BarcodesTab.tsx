import { Button, Icon, Select, type TableColumn, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { newBarcodeRow, type ItemBarcode } from '../../../../mocks/items';
import { unitOptions, type TabProps } from './types';

export function BarcodesTab({ draft, update, errors }: TabProps) {
  const rows = draft.barcodes;
  const units = unitOptions(draft);
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
          invalid={!!err(r, 'uom')}
          options={units}
          value={r.uom}
          onValueChange={(uom) => uom && patch(r.id, { uom })}
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
          {err(r, 'barcode') ? <Text variant="caption" tone="danger" className="mt-1">{err(r, 'barcode')}</Text> : null}
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
  ];

  return (
    <>
      <DataTable
        icon="barcode"
        title="Barcodes"
        description="One barcode per packaging unit, so scanning a box or a carton finds the right quantity. Barcodes must be unique across all items."
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        onRemove={(picked) => update({ barcodes: rows.filter((r) => !picked.includes(r)) })}
        actions={
          <Button
            type="button"
            size="small"
            intent="primary"
            variant="solid"
            aria-label="New barcode"
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={() => update({ barcodes: [...rows, newBarcodeRow(draft.inventoryUom)] })}
          >
            New
          </Button>
        }
        empty={
          <Text variant="small" tone="muted">
            No barcodes. {draft.gtin ? `The GTIN on the General tab (${draft.gtin}) still scans.` : ''}
          </Text>
        }
      />
      {errors.barcodes ? (
        <Text variant="small" tone="danger">
          {errors.barcodes}
        </Text>
      ) : null}
    </>
  );
}
