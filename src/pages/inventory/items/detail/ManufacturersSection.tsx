import { useState } from 'react';
import { Checkbox, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import { RowMenu } from '../../../../components/form/RowMenu';
import { newManufacturerRow, type ItemManufacturer } from '../../../../mocks/items';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { manufacturerDef } from '../../../settings/masterDefs';
import type { Draft } from './types';

/**
 * Every manufacturer the item is sourced from, as cards in the side column (like warehouses).
 * The starred one is the main manufacturer, whose catalog no. goes on purchase order lines.
 * Adding and editing happen in `ManufacturerPanel`.
 */
export function ManufacturersCards({
  draft,
  update,
  inv,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  inv: InventoryMasters;
  onOpen: (row: ItemManufacturer, isNew: boolean) => void;
}) {
  const rows = draft.manufacturers;
  const master = (code: string) => inv.manufacturers.find((m) => m.code === code);
  // Removing the main manufacturer leaves the item without one.
  const remove = (r: ItemManufacturer) =>
    update({
      manufacturers: rows.filter((x) => x.id !== r.id),
      ...(r.code === draft.manufacturer ? { manufacturer: '' } : {}),
    });

  return (
    <Section
      icon="factory"
      title={`Manufacturers${rows.length ? ` (${rows.length})` : ''}`}
      actions={
        <Link aria-label="Add manufacturer" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => onOpen(newManufacturerRow(), true)}>
          New
        </Link>
      }
    >
      {rows.length ? (
        <List.Group>
          {rows.map((r) => {
            const m = master(r.code);
            const main = !!r.code && r.code === draft.manufacturer;
            return (
              <List.Card
                key={r.id}
                title={m ? `${m.code} · ${m.name}` : r.code || 'No manufacturer picked'}
                icon={<Icon size={16}>factory</Icon>}
                badge={main ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  { label: 'Main', value: main ? 'Main manufacturer' : '' },
                  { label: 'Catalog no.', value: r.catalogNo ? `Catalog no. ${r.catalogNo}` : '' },
                  { label: 'Country', value: m?.countryCode ?? '' },
                ].filter((x) => !!x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${r.code || 'manufacturer'}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(r, false) },
                      { label: 'Set as main', icon: 'star', disabled: main || !r.code, onSelect: () => update({ manufacturer: r.code }) },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(r) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No manufacturers linked.
        </Text>
      )}
    </Section>
  );
}

/** Add a manufacturer to the item, or edit its catalog number and whether it's the main one. */
export function ManufacturerPanel({
  value,
  isNew,
  draft,
  onDone,
  onCancel,
}: {
  value: ItemManufacturer;
  isNew: boolean;
  draft: Draft;
  onDone: (row: ItemManufacturer, main: boolean) => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState(value);
  // The first manufacturer becomes the main one unless unticked.
  const [main, setMain] = useState(isNew ? !draft.manufacturer : !!value.code && value.code === draft.manufacturer);
  const [errors, setErrors] = useState<Errors>({});
  const f = bind(row, (p: Partial<ItemManufacturer>) => setRow((r) => ({ ...r, ...p })));

  const done = () => {
    const e: Errors = {};
    if (!row.code) e.code = 'Pick a manufacturer.';
    else if (draft.manufacturers.some((m) => m.id !== row.id && m.code === row.code)) e.code = `${row.code} is already linked to this item.`;
    setErrors(e);
    if (!Object.keys(e).length) onDone(row, main);
  };

  return (
    <EditPanel icon="factory" title={isNew ? 'Add manufacturer' : row.code || 'Manufacturer'} onCancel={onCancel} onDone={done}>
      <Section icon="factory" title="Manufacturer">
        <Fields>
          {f.master('code', 'Manufacturer', manufacturerDef, { required: true, error: errors.code })}
          {f.text('catalogNo', 'Manufacturer’s catalog no.', {
            placeholder: 'e.g. MU7E3PH/A',
            hint: 'The manufacturer’s own part number, for warranties and price lists.',
          })}
        </Fields>
        <Checkbox checked={main} onChange={(e) => setMain(e.currentTarget.checked)}>
          Main manufacturer
        </Checkbox>
        {main && draft.manufacturer && draft.manufacturer !== value.code ? (
          <Text variant="small" tone="muted">
            Takes over from {draft.manufacturer}.
          </Text>
        ) : null}
      </Section>
    </EditPanel>
  );
}
