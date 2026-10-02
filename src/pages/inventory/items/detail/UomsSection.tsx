import { useState } from 'react';
import { Button, Checkbox, FormField, Icon, Link, List, Select, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind, type Errors } from '../../../../components/form/fields';
import { RowMenu } from '../../../../components/form/RowMenu';
import { conversionSummary, groupUoms, volumeUnit } from '../../../../mocks/itemMasters';
import { newItemUom, unitPrice, unitsFromGroup, uomSummary, type ItemUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { uomDef } from '../../../settings/masterDefs';
import type { Draft } from './types';

/** Which documents a unit is the default on, as picked in `UomPanel`. */
export interface UomDefaults {
  purchasing: boolean;
  sales: boolean;
}

/** "PHP 30,000 / box (1,250 per pc)" when the unit has its own price, else the derived price. */
const priceText = (draft: Draft, u: ItemUom) => {
  if (!draft.basePrice && !u.price) return '';
  const price = unitPrice(draft, u.uom);
  const own = u.price && u.uom !== draft.inventoryUom ? ` (own price, ${formatAmount(price / (u.qty || 1))} per ${draft.inventoryUom})` : '';
  return `PHP ${formatAmount(price)} / ${u.uom}${own}`;
};

const dims = (u: ItemUom, inv: InventoryMasters) => {
  const { lengthUnit, weightUnit } = inv.settings;
  const size = u.length && u.width && u.height ? `${u.length} × ${u.width} × ${u.height} ${lengthUnit}` : '';
  const weight = u.grossWeight || u.netWeight ? `${u.grossWeight || u.netWeight} ${weightUnit}` : '';
  return [size, weight].filter(Boolean).join(' · ');
};

/**
 * Every unit the item is counted, bought or sold in, as cards in the side column. The
 * inventory UoM comes first and always converts 1:1. Adding and editing happen in
 * `UomPanel`; "From group" copies a UoM group's units in (`UomGroupPanel`).
 */
export function UomsCards({
  draft,
  update,
  inv,
  lockedIds,
  onOpen,
  onAddFromGroup,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  inv: InventoryMasters;
  /** Units saved on an item with transactions: their unit and qty can't change, and they can't be removed. */
  lockedIds: Set<string>;
  onOpen: (row: ItemUom, isNew: boolean) => void;
  onAddFromGroup: () => void;
}) {
  const rows = [...draft.uoms].sort((a, b) => Number(b.uom === draft.inventoryUom) - Number(a.uom === draft.inventoryUom));
  const name = (code: string) => inv.uoms.find((u) => u.code === code)?.name;
  const barcodes = (code: string) => draft.barcodes.filter((b) => b.uom === code).length;
  // Default purchasing / sales units fall back to the inventory unit when theirs is removed.
  const remove = (r: ItemUom) =>
    update({
      uoms: draft.uoms.filter((x) => x.id !== r.id),
      ...(draft.purchasingUom === r.uom ? { purchasingUom: draft.inventoryUom } : {}),
      ...(draft.salesUom === r.uom ? { salesUom: draft.inventoryUom } : {}),
    });

  return (
    <Section
      icon="straighten"
      title={`Units of measure (${rows.length})`}
      actions={
        <>
          <Link aria-label="Add units from a UoM group" leadingIcon={<Icon size={20}>playlist_add</Icon>} onClick={onAddFromGroup}>
            From group
          </Link>
          <Link aria-label="Add unit of measure" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => onOpen(newItemUom(), true)}>
            New
          </Link>
        </>
      }
    >
      <List.Group>
        {rows.map((r) => {
          const base = r.uom === draft.inventoryUom;
          const n = barcodes(r.uom);
          const use = [
            r.purchase ? (draft.purchasingUom === r.uom ? 'Default for purchasing' : 'Purchasing') : '',
            r.sales ? (draft.salesUom === r.uom ? 'Default for sales' : 'Sales') : '',
          ].filter(Boolean);
          const blocked = base ? 'the inventory unit' : lockedIds.has(r.id) ? 'has transactions' : n ? 'has barcodes' : '';
          return (
            <List.Card
              key={r.id}
              title={name(r.uom) ? `${r.uom} · ${name(r.uom)}` : r.uom || 'No unit picked'}
              icon={<Icon size={16}>{base ? 'inventory_2' : 'package_2'}</Icon>}
              badge={base ? <Icon size={12}>star</Icon> : undefined}
              fields={[
                { label: 'Conversion', value: uomSummary(draft, r.uom) },
                { label: 'Price', value: draft.salesItem && r.sales ? priceText(draft, r) : '' },
                { label: 'Used for', value: use.length ? use.join(' · ') : 'Not on purchase or sales documents' },
                { label: 'Size', value: dims(r, inv) },
                { label: 'Barcodes', value: n ? `${n} barcode${n === 1 ? '' : 's'}` : '' },
              ].filter((x) => !!x.value)}
              actions={
                <RowMenu
                  label={`Actions for ${r.uom || 'unit'}`}
                  items={[
                    { label: 'Edit', icon: 'edit', onSelect: () => onOpen(r, false) },
                    {
                      label: blocked ? `Remove (${blocked})` : 'Remove',
                      icon: 'delete',
                      disabled: !!blocked,
                      onSelect: () => remove(r),
                    },
                  ]}
                />
              }
            />
          );
        })}
      </List.Group>
    </Section>
  );
}

/** Add a unit to the item, or edit its conversion, where it's used, and its size and weight. */
export function UomPanel({
  value,
  isNew,
  locked,
  draft,
  inv,
  onDone,
  onCancel,
}: {
  value: ItemUom;
  isNew: boolean;
  /** Saved on an item with transactions: the unit and qty can't change. */
  locked: boolean;
  draft: Draft;
  inv: InventoryMasters;
  onDone: (row: ItemUom, defaults: UomDefaults) => void;
  onCancel: () => void;
}) {
  const { lengthUnit, weightUnit } = inv.settings;
  const [row, setRow] = useState(value);
  const [defaults, setDefaults] = useState<UomDefaults>({
    purchasing: !isNew && draft.purchasingUom === value.uom,
    sales: !isNew && draft.salesUom === value.uom,
  });
  const [errors, setErrors] = useState<Errors>({});
  const f = bind(row, (p: Partial<ItemUom>) => setRow((r) => ({ ...r, ...p })));
  const base = !isNew && value.uom === draft.inventoryUom;
  const volume = Math.round(row.length * row.width * row.height * 100) / 100;

  const done = () => {
    const e: Errors = {};
    if (!row.uom) e.uom = 'Pick a unit.';
    else if (draft.uoms.some((u) => u.id !== row.id && u.uom === row.uom)) e.uom = `${row.uom} is already a unit of this item.`;
    if (!(row.qty > 0)) e.qty = 'Enter more than 0.';
    if (row.price < 0) e.price = 'Price can’t be negative.';
    if (defaults.purchasing && !row.purchase) e.purchase = 'The default purchasing unit must be usable on purchase documents.';
    if (defaults.sales && !row.sales) e.sales = 'The default sales unit must be usable on sales documents.';
    setErrors(e);
    if (!Object.keys(e).length) onDone(row, defaults);
  };

  return (
    <EditPanel icon="straighten" title={isNew ? 'Add unit of measure' : row.uom || 'Unit of measure'} onCancel={onCancel} onDone={done}>
      <Section icon="swap_horiz" title="Unit & conversion">
        <Fields>
          {f.master('uom', 'Unit', uomDef, {
            required: true,
            error: errors.uom,
            disabled: base || locked,
            hint: base ? 'The inventory unit — change it in the item header.' : locked ? 'Locked: the item has transactions in this unit.' : undefined,
          })}
          {f.num('qty', `${draft.inventoryUom} per ${row.uom || 'unit'}`, {
            required: true,
            error: errors.qty,
            disabled: base || locked,
            hint: base
              ? 'Stock is kept in this unit.'
              : locked
                ? 'Locked: a different factor would misstate stock and cost already posted.'
                : `Buying 5 ${row.uom || 'units'} adds ${5 * (row.qty || 0)} ${draft.inventoryUom} to stock.`,
          })}
        </Fields>
      </Section>

      <Section icon="sell" title="Price">
        <Fields>
          {base ? (
            <Text variant="small" tone="muted">
              The inventory unit sells at the base price on the Sales data tab (PHP {formatAmount(draft.basePrice)}).
            </Text>
          ) : (
            f.num('price', `Price per ${row.uom || 'unit'}`, {
              prefix: 'PHP',
              error: errors.price,
              placeholder: formatAmount(Math.round(draft.basePrice * (row.qty || 0) * 100) / 100),
              hint: row.price
                ? `Own price: ${formatAmount(row.price / (row.qty || 1))} per ${draft.inventoryUom}, vs. ${formatAmount(draft.basePrice)} base. Clear it to use ${row.qty} × base price.`
                : `Leave at 0 to use ${row.qty || 0} × the base price (PHP ${formatAmount(draft.basePrice)}). Set it for a pack or case price.`,
            })
          )}
        </Fields>
      </Section>

      <Section icon="description" title="Documents">
        <Flags>
          {f.check('purchase', 'Use on purchase documents')}
          {f.check('sales', 'Use on sales documents')}
        </Flags>
        <Flags>
          <Checkbox checked={defaults.purchasing} onChange={(e) => setDefaults((d) => ({ ...d, purchasing: e.currentTarget.checked }))}>
            Default purchasing unit
          </Checkbox>
          <Checkbox checked={defaults.sales} onChange={(e) => setDefaults((d) => ({ ...d, sales: e.currentTarget.checked }))}>
            Default sales unit
          </Checkbox>
        </Flags>
        {errors.purchase || errors.sales ? (
          <Text variant="small" tone="danger">
            {errors.purchase ?? errors.sales}
          </Text>
        ) : (
          <Text variant="small" tone="muted">
            Defaults pre-fill new documents. Unticking one moves it back to {draft.inventoryUom}.
          </Text>
        )}
      </Section>

      <Section
        icon="deployed_code"
        title={`Size & weight · per ${row.uom || 'unit'} · ${lengthUnit} / ${weightUnit}`}
        actions={
          <Button type="button" size="small" variant="ghost" disabled={!volume} onClick={() => setRow((r) => ({ ...r, volume }))}>
            Calculate volume
          </Button>
        }
      >
        <Fields cols={3}>
          {f.num('length', 'Length', { suffix: lengthUnit })}
          {f.num('width', 'Width', { suffix: lengthUnit })}
          {f.num('height', 'Height', { suffix: lengthUnit })}
          {f.num('volume', 'Volume', { suffix: volumeUnit(lengthUnit) })}
          {f.num('netWeight', 'Net weight', { suffix: weightUnit, hint: 'Without packaging.' })}
          {f.num('grossWeight', 'Gross weight', { suffix: weightUnit, hint: 'With packaging.' })}
        </Fields>
      </Section>
    </EditPanel>
  );
}

/** Copy a UoM group's units into the item, converted to its inventory unit. Units it already has are skipped. */
export function UomGroupPanel({
  draft,
  inv,
  onDone,
  onCancel,
}: {
  draft: Draft;
  inv: InventoryMasters;
  onDone: (rows: ItemUom[]) => void;
  onCancel: () => void;
}) {
  const groups = inv.uomGroups.filter((g) => g.active);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const group = groups.find((g) => g.code === code);
  const adds = group ? unitsFromGroup(draft, group) : [];
  const fits = !!group && groupUoms(group).includes(draft.inventoryUom);

  const done = () => {
    if (!group) return setError('Pick a UoM group.');
    if (!adds.length) return setError(fits ? 'The item already has every unit in this group.' : `${group.code} doesn’t have ${draft.inventoryUom}.`);
    onDone(adds);
  };

  return (
    <EditPanel icon="playlist_add" title="Add units from a UoM group" onCancel={onCancel} onDone={done}>
      <Section icon="scale" title="UoM group">
        <Fields>
          <FormField label="UoM group" required error={error} tooltip="A one-time copy: changing the group later doesn’t change this item.">
            {(p) => (
              <Select
                {...p}
                placeholder="Pick a group"
                options={groups.map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` }))}
                value={code}
                onValueChange={(v) => {
                  setCode(v ?? '');
                  setError('');
                }}
              />
            )}
          </FormField>
        </Fields>
        {group ? (
          <Text variant="small" tone="muted">
            {conversionSummary(group)}
          </Text>
        ) : null}
      </Section>
      {group ? (
        <Section icon="straighten" title={adds.length ? `Units to add (${adds.length})` : 'Nothing to add'}>
          {adds.length ? (
            <List.Group>
              {adds.map((u) => (
                <List.Card key={u.id} title={u.uom} icon={<Icon size={16}>package_2</Icon>} fields={[{ label: 'Conversion', value: `1 ${u.uom} = ${u.qty} ${draft.inventoryUom}` }]} />
              ))}
            </List.Group>
          ) : (
            <Text variant="small" tone="muted">
              {fits
                ? 'The item already has every unit in this group.'
                : `${group.code} doesn’t include ${draft.inventoryUom}, so its units can’t be converted to this item’s inventory unit.`}
            </Text>
          )}
        </Section>
      ) : null}
    </EditPanel>
  );
}
