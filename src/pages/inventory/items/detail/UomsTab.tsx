import { useState } from 'react';
import {
  Button,
  Checkbox,
  FormField,
  Icon,
  List,
  Radio,
  Select,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, Section } from '../../../../components/form/fields';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { conversionSummary, groupUoms, volumeUnit } from '../../../../mocks/itemMasters';
import { newItemUom, unitPrice, unitsFromGroup, type ItemUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { uomDef } from '../../../settings/masterDefs';
import type { Draft, TabProps } from './types';

export const uomErrorKey = (u: Pick<ItemUom, 'id'>, field: 'uom' | 'qty' | 'price') => `uom:${u.id}:${field}`;

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Every unit the item is counted, bought or sold in, with its conversion to the inventory
 * unit, its price, where it's used, and (behind "Size & weight") its dimensions. The
 * inventory unit comes first and always converts 1:1.
 */
export function UomsTab({ draft, update, errors, inv, lockedUomIds, onAddUomsFromGroup }: TabProps) {
  const { lengthUnit, weightUnit } = inv.settings;
  const [showSize, setShowSize] = useState(false);
  const base = draft.inventoryUom;
  const rows = [...draft.uoms].sort((a, b) => Number(b.uom === base) - Number(a.uom === base));
  const barcodes = (code: string) => draft.barcodes.filter((b) => b.uom === code).length;
  const isBase = (r: ItemUom) => r.uom === base;
  const locked = (r: ItemUom) => isBase(r) || lockedUomIds.has(r.id);

  const patch = (r: ItemUom, p: Partial<ItemUom>) => {
    const next = { ...r, ...p };
    // A renamed unit takes its barcodes and default-unit roles along.
    const renamed = p.uom !== undefined && p.uom !== r.uom && r.uom;
    const follow = (code: string) => (renamed && code === r.uom ? next.uom : code);
    update({
      uoms: draft.uoms.map((u) => (u.id === r.id ? next : u)),
      ...(renamed
        ? {
            purchasingUom: follow(draft.purchasingUom),
            salesUom: follow(draft.salesUom),
            barcodes: draft.barcodes.map((b) => (b.uom === r.uom ? { ...b, uom: next.uom } : b)),
          }
        : {}),
    });
  };
  /** Why a row can't be removed, or '' when it can. */
  const blocked = (r: ItemUom) =>
    isBase(r) ? 'the inventory unit' : lockedUomIds.has(r.id) ? 'has transactions' : barcodes(r.uom) ? 'has barcodes' : '';
  const remove = (picked: ItemUom[]) => {
    const gone = picked.filter((r) => !blocked(r));
    const codes = new Set(gone.map((r) => r.uom));
    update({
      uoms: draft.uoms.filter((u) => !gone.includes(u)),
      ...(codes.has(draft.purchasingUom) ? { purchasingUom: base } : {}),
      ...(codes.has(draft.salesUom) ? { salesUom: base } : {}),
    });
  };
  const kept = rows.filter((r) => blocked(r));

  const err = (r: ItemUom, field: 'uom' | 'qty' | 'price') =>
    errors[uomErrorKey(r, field)] ? (
      <Text variant="caption" tone="danger" className="mt-1">
        {errors[uomErrorKey(r, field)]}
      </Text>
    ) : null;
  const numberCell = (r: ItemUom, key: 'length' | 'width' | 'height' | 'volume' | 'netWeight' | 'grossWeight', label: string) => (
    <TextField
      aria-label={`${label} of ${r.uom || 'unit'}`}
      type="number"
      min={0}
      className="w-24"
      value={r[key] ? String(r[key]) : ''}
      placeholder="0"
      onChange={(e) => patch(r, { [key]: num(e.currentTarget.value) })}
    />
  );

  const columns: TableColumn<ItemUom>[] = [
    {
      key: 'uom',
      header: 'Unit',
      cell: (r) =>
        locked(r) ? (
          <span className="inline-flex items-center gap-1 font-medium">
            {r.uom}
            {isBase(r) ? <Icon size={14}>star</Icon> : <Icon size={14}>lock</Icon>}
          </span>
        ) : (
          <div className="w-36">
            <MasterLookup
              def={uomDef}
              fieldProps={{ 'aria-label': 'Unit', invalid: !!errors[uomErrorKey(r, 'uom')] }}
              value={r.uom}
              onChange={(uom) => patch(r, { uom })}
            />
            {err(r, 'uom')}
          </div>
        ),
    },
    {
      key: 'qty',
      header: `Qty (${base})`,
      cell: (r) =>
        locked(r) ? (
          String(r.qty)
        ) : (
          <div className="w-24">
            <TextField
              aria-label={`${base} per ${r.uom || 'unit'}`}
              type="number"
              min={0}
              invalid={!!errors[uomErrorKey(r, 'qty')]}
              value={String(r.qty)}
              onChange={(e) => patch(r, { qty: num(e.currentTarget.value) })}
            />
            {err(r, 'qty')}
          </div>
        ),
    },
    {
      key: 'price',
      header: 'Price (PHP)',
      cell: (r) =>
        isBase(r) ? (
          <span>
            {formatAmount(draft.basePrice)} <span className="text-muted">base price</span>
          </span>
        ) : (
          <div className="w-32">
            <TextField
              aria-label={`Price per ${r.uom || 'unit'}`}
              type="number"
              min={0}
              invalid={!!errors[uomErrorKey(r, 'price')]}
              // Empty means "qty × base price", shown as the placeholder.
              value={r.price ? String(r.price) : ''}
              placeholder={formatAmount(Math.round(draft.basePrice * (r.qty || 0) * 100) / 100)}
              onChange={(e) => patch(r, { price: num(e.currentTarget.value) })}
            />
            {err(r, 'price')}
          </div>
        ),
    },
    {
      key: 'perBase',
      header: `Per ${base}`,
      cell: (r) => {
        if (!(r.qty > 0) || !r.uom) return <span className="text-muted">—</span>;
        const each = unitPrice(draft, r.uom) / (r.qty || 1);
        const off = draft.basePrice ? Math.round((1 - each / draft.basePrice) * 100) : 0;
        return (
          <span>
            {formatAmount(Math.round(each * 100) / 100)}
            {off > 0 && r.price ? <span className="text-muted"> ({off}% off)</span> : null}
          </span>
        );
      },
    },
    {
      key: 'purchase',
      header: 'Purchase',
      cell: (r) => (
        <Checkbox
          aria-label={`Use ${r.uom || 'unit'} on purchase documents`}
          checked={r.purchase}
          disabled={draft.purchasingUom === r.uom}
          title={draft.purchasingUom === r.uom ? 'The default purchasing unit is always usable on purchases.' : undefined}
          onChange={(e) => patch(r, { purchase: e.currentTarget.checked })}
        />
      ),
    },
    {
      key: 'sales',
      header: 'Sales',
      cell: (r) => (
        <Checkbox
          aria-label={`Use ${r.uom || 'unit'} on sales documents`}
          checked={r.sales}
          disabled={draft.salesUom === r.uom}
          title={draft.salesUom === r.uom ? 'The default sales unit is always usable on sales.' : undefined}
          onChange={(e) => patch(r, { sales: e.currentTarget.checked })}
        />
      ),
    },
    {
      key: 'defaultPurchasing',
      header: 'Default purch.',
      cell: (r) => (
        <Radio
          name="default-purchasing-uom"
          aria-label={`Make ${r.uom || 'unit'} the default purchasing unit`}
          checked={!!r.uom && draft.purchasingUom === r.uom}
          disabled={!r.uom}
          onChange={() => update({ purchasingUom: r.uom, uoms: draft.uoms.map((u) => (u.id === r.id ? { ...u, purchase: true } : u)) })}
        />
      ),
    },
    {
      key: 'defaultSales',
      header: 'Default sales',
      cell: (r) => (
        <Radio
          name="default-sales-uom"
          aria-label={`Make ${r.uom || 'unit'} the default sales unit`}
          checked={!!r.uom && draft.salesUom === r.uom}
          disabled={!r.uom}
          onChange={() => update({ salesUom: r.uom, uoms: draft.uoms.map((u) => (u.id === r.id ? { ...u, sales: true } : u)) })}
        />
      ),
    },
    ...(showSize
      ? ([
          { key: 'length', header: `L (${lengthUnit})`, cell: (r) => numberCell(r, 'length', 'Length') },
          { key: 'width', header: `W (${lengthUnit})`, cell: (r) => numberCell(r, 'width', 'Width') },
          { key: 'height', header: `H (${lengthUnit})`, cell: (r) => numberCell(r, 'height', 'Height') },
          {
            key: 'volume',
            header: `Vol. (${volumeUnit(lengthUnit)})`,
            cell: (r) => (
              <div className="flex items-center gap-1">
                {numberCell(r, 'volume', 'Volume')}
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`Calculate volume of ${r.uom || 'unit'}`}
                  disabled={!(r.length && r.width && r.height)}
                  onClick={() => patch(r, { volume: Math.round(r.length * r.width * r.height * 100) / 100 })}
                >
                  <Icon size={16}>calculate</Icon>
                </Button>
              </div>
            ),
          },
          { key: 'netWeight', header: `Net (${weightUnit})`, cell: (r) => numberCell(r, 'netWeight', 'Net weight') },
          { key: 'grossWeight', header: `Gross (${weightUnit})`, cell: (r) => numberCell(r, 'grossWeight', 'Gross weight') },
        ] satisfies TableColumn<ItemUom>[])
      : []),
    { key: 'barcodes', header: 'Barcodes', cell: (r) => String(barcodes(r.uom) || '—') },
  ];

  return (
    <>
      <DataTable
        icon="straighten"
        title="Units of measure"
        description={`Every unit the item is counted, bought or sold in. Qty is how many ${base} one unit holds; leave Price empty to use qty × the base price.`}
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        unsortable={columns.map((c) => c.key)}
        onRemove={remove}
        actions={
          <>
            <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>deployed_code</Icon>} onClick={() => setShowSize((s) => !s)}>
              {showSize ? 'Hide size & weight' : 'Size & weight'}
            </Button>
            <Button type="button" size="small" variant="ghost" leadingIcon={<Icon size={16}>playlist_add</Icon>} onClick={onAddUomsFromGroup}>
              From group
            </Button>
            <Button
              type="button"
              size="small"
              intent="primary"
              variant="solid"
              aria-label="New unit of measure"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={() => update({ uoms: [...draft.uoms, newItemUom('', { qty: 0 })] })}
            >
              New
            </Button>
          </>
        }
        empty={
          <Text variant="small" tone="muted">
            No units.
          </Text>
        }
      />
      <Text variant="small" tone="muted">
        {kept.length
          ? `Can’t be removed: ${kept.map((r) => `${r.uom} (${blocked(r)})`).join(', ')}. `
          : ''}
        {lockedUomIds.size ? 'Units saved before the item had transactions keep their unit and qty, so posted stock and cost stay right.' : ''}
      </Text>
    </>
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
