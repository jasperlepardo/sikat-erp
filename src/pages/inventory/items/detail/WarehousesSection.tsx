import { useState } from 'react';
import { Combobox, FormField, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, type Errors } from '../../../../components/form/fields';
import { RowMenu } from '../../../../components/form/RowMenu';
import { addressSummary } from '../../../../mocks/address';
import { newItemWarehouse, type ItemWarehouse } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { binsOf } from '../../../../services/binLocations';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { vendorOptions, type Draft } from './types';

const qty = (n: number) => n.toLocaleString('en-PH');
const hasActivity = (w: ItemWarehouse) => w.inStock + w.committed + w.ordered > 0;
export const binErrorKey = (code: string) => `wh:${code}:bin`;

/**
 * The warehouses an item is kept in, as cards in the side column (like a partner's addresses).
 * Quantities per status are on the Inventory data tab; adding and editing happen in
 * `WarehousePanel`.
 */
export function WarehousesCards({
  draft,
  update,
  inv,
  vendors,
  errors,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  inv: InventoryMasters;
  vendors: Partner[];
  errors: Errors;
  onOpen: (row: ItemWarehouse, isNew: boolean) => void;
}) {
  const warehouseOf = (code: string) => inv.warehouses.find((w) => w.code === code);
  const free = inv.warehouses.filter((w) => w.active && !draft.warehouses.some((x) => x.code === w.code));
  const service = draft.itemType !== 'Items';

  return (
    <Section
      icon="warehouse"
      title={`Warehouses${draft.warehouses.length ? ` (${draft.warehouses.length})` : ''}`}
      actions={
        draft.inventoryItem && free.length ? (
          <Link aria-label="Add warehouse" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => onOpen(newItemWarehouse(''), true)}>
            New
          </Link>
        ) : undefined
      }
    >
      {!draft.inventoryItem ? (
        <Text variant="small" tone="muted">
          {service ? `${draft.itemType} items aren’t stocked.` : 'Not an inventory item, so it isn’t kept in a warehouse.'}
        </Text>
      ) : draft.warehouses.length ? (
        <List.Group>
          {draft.warehouses.map((w) => {
            const wh = warehouseOf(w.code);
            const vendor = vendors.find((v) => v.id === w.preferredVendorId);
            const binError = errors[binErrorKey(w.code)];
            return (
              <List.Card
                key={w.code}
                title={`${w.code} · ${wh?.name ?? 'Unknown warehouse'}`}
                icon={<Icon size={16}>warehouse</Icon>}
                fields={[
                  { label: 'In stock', value: `${qty(w.inStock)} ${draft.inventoryUom} in stock` },
                  { label: 'Preferred vendor', value: vendor ? `Buys from ${vendor.name}` : '' },
                  {
                    label: 'Default bin',
                    value: binError ? <span className="text-danger">{binError}</span> : w.defaultBin ? `Bin ${w.defaultBin}` : '',
                  },
                  { label: 'Address', value: addressSummary(wh?.address) },
                ].filter((x) => !!x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${w.code}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(w, false) },
                      {
                        label: hasActivity(w) ? 'Remove (has stock or open documents)' : 'Remove',
                        icon: 'delete',
                        disabled: hasActivity(w),
                        onSelect: () => update({ warehouses: draft.warehouses.filter((x) => x.code !== w.code) }),
                      },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          Not stocked in any warehouse yet.
        </Text>
      )}
    </Section>
  );
}

/** Add a warehouse to the item, or edit its preferred vendor and default bin. */
export function WarehousePanel({
  value,
  isNew,
  draft,
  inv,
  vendors,
  onDone,
  onCancel,
}: {
  value: ItemWarehouse;
  isNew: boolean;
  draft: Draft;
  inv: InventoryMasters;
  vendors: Partner[];
  onDone: (row: ItemWarehouse) => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const wh = inv.warehouses.find((w) => w.code === row.code);
  const free = inv.warehouses.filter((w) => w.active && !draft.warehouses.some((x) => x.code === w.code));

  const done = () => {
    const e: Errors = {};
    if (!row.code) e.code = 'Pick a warehouse.';
    if (wh?.binEnabled && !row.defaultBin) e.defaultBin = `${wh.code} uses bins — pick a default bin.`;
    setErrors(e);
    if (!Object.keys(e).length) onDone(row);
  };

  return (
    <EditPanel icon="warehouse" title={isNew ? 'Add warehouse' : `${row.code} · ${wh?.name ?? ''}`} onCancel={onCancel} onDone={done}>
      <Section icon="warehouse" title="Warehouse">
        <Fields>
          {isNew ? (
            <FormField label="Warehouse" required error={errors.code}>
              {(p) => (
                <Combobox
                  {...p}
                  options={free.map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` }))}
                  placeholder="Pick a warehouse"
                  value={row.code || null}
                  onValueChange={(code) => setRow({ ...row, code: code ?? '', defaultBin: '' })}
                />
              )}
            </FormField>
          ) : (
            <ReadOnly label="Warehouse" value={`${row.code} · ${wh?.name ?? 'Unknown warehouse'}`} />
          )}
          <ReadOnly label="Address" value={addressSummary(wh?.address) || '—'} hint="Edit it in Inventory › Warehouses & Bins." />
          <FormField label="Preferred vendor" tooltip="MRP routes this warehouse’s replenishment to this vendor.">
            {(p) => (
              <Combobox
                {...p}
                options={vendorOptions(vendors).filter((o) => o.value)}
                placeholder="None"
                clearable
                value={row.preferredVendorId || null}
                onValueChange={(v) => setRow({ ...row, preferredVendorId: v ?? '' })}
              />
            )}
          </FormField>
          {wh?.binEnabled ? (
            <FormField label="Default bin" required error={errors.defaultBin} tooltip="Receipts and picks default to this bin.">
              {(p) => (
                <Combobox
                  {...p}
                  options={binsOf(inv.bins, wh.code, row.defaultBin).map((b) => ({
                    value: b.code,
                    label: b.code,
                    subLabel: b.description || undefined,
                  }))}
                  placeholder="Pick a bin"
                  value={row.defaultBin || null}
                  onValueChange={(v) => setRow({ ...row, defaultBin: v ?? '' })}
                />
              )}
            </FormField>
          ) : (
            <ReadOnly label="Default bin" value={wh ? 'No bin management' : '—'} />
          )}
        </Fields>
        {!isNew ? (
          <Text variant="small" tone="muted">
            Stock here: {qty(row.inStock)} in stock, {qty(row.committed)} committed, {qty(row.ordered)} ordered.
          </Text>
        ) : null}
      </Section>
    </EditPanel>
  );
}
