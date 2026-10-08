import { Fragment } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Flags, ReadOnly, bind, type Errors } from '../../../components/form/fields';
import { MasterList, statusColumn, type ListRoute } from '../../../components/form/MasterList';
import { uomDef } from '../../settings/masterDefs';
import {
  BATCH_RESTRICTIONS,
  ITEM_RESTRICTIONS,
  SUBLEVEL_TIERS,
  TIER_LABEL,
  TRANSACTION_RESTRICTIONS,
  UOM_RESTRICTIONS,
  binCode,
  blankBin,
  type BinLocation,
} from '../../../mocks/binLocations';
import type { Item } from '../../../mocks/items';
import { binStock } from '../../../services/binLocations';
import { itemGroups, uomGroups, binLocations } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { binWarehouseOptions, sublevelDef } from './sublevels';
import { locationStock, stockColumns } from './locationStock';
import { DataTable } from '../../../components/form/DataTable';

const label = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((o) => o.value === v)?.label ?? v;
export const qty = (n: number) => n.toLocaleString('en-PH');

const UPDATED = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

/** The bin's restrictions in a few words, for the list. */
export function restrictionSummary(b: BinLocation) {
  const parts: string[] = [];
  if (b.itemRestriction === 'item') parts.push(`Item ${b.restrictedItem}`);
  else if (b.itemRestriction === 'itemGroup') parts.push(b.restrictedItemGroup);
  else if (b.itemRestriction !== 'none') parts.push(label(ITEM_RESTRICTIONS, b.itemRestriction));
  if (b.uomRestriction === 'uom') parts.push(`UoM ${b.restrictedUom}`);
  else if (b.uomRestriction === 'uomGroup') parts.push(`UoM group ${b.restrictedUomGroup}`);
  else if (b.uomRestriction !== 'none') parts.push(label(UOM_RESTRICTIONS, b.uomRestriction));
  if (b.batchRestriction !== 'none') parts.push('Single batch');
  if (b.transactionRestriction !== 'none') parts.push(label(TRANSACTION_RESTRICTIONS, b.transactionRestriction));
  return parts.join(' · ');
}

/** Field errors for a bin about to be saved. */
function validateBin(b: BinLocation, all: BinLocation[], items: Item[]): Errors {
  const e: Errors = {};
  if (!b.warehouse) e.warehouse = 'Pick a bin-enabled warehouse.';
  for (const t of SUBLEVEL_TIERS) if (!b[t]) e[t] = `${TIER_LABEL[t]} is required.`;
  const code = b.warehouse && b.aisle && b.shelf && b.level ? binCode(b.warehouse, b.aisle, b.shelf, b.level) : '';
  if (code && all.some((x) => x.id !== b.id && x.code === code)) e.code = `${code} already exists.`;
  for (const k of ['minQty', 'maxQty', 'maxWeight'] as const) if (b[k] < 0) e[k] = 'Can’t be negative.';
  if (b.maxQty && b.minQty > b.maxQty) e.minQty = 'Minimum is more than the maximum.';
  if (b.itemRestriction === 'item' && !b.restrictedItem) e.restrictedItem = 'Pick the item.';
  if (b.itemRestriction === 'itemGroup' && !b.restrictedItemGroup) e.restrictedItemGroup = 'Pick the item group.';
  if (b.uomRestriction === 'uom' && !b.restrictedUom) e.restrictedUom = 'Pick the unit.';
  if (b.uomRestriction === 'uomGroup' && !b.restrictedUomGroup) e.restrictedUomGroup = 'Pick the UoM group.';
  const otherReceiving = all.find((x) => x.id !== b.id && x.warehouse === b.warehouse && x.active && x.receiving);
  if (b.active && b.receiving && otherReceiving) e.receiving = `${otherReceiving.code} is already ${b.warehouse}’s receiving bin.`;
  const original = all.find((x) => x.id === b.id);
  if (!b.active && original?.active) {
    const stock = binStock(original, items);
    if (stock.qty) e.active = `${qty(stock.qty)} units of ${stock.items} item${stock.items === 1 ? '' : 's'} are still here — transfer them out first.`;
  }
  return e;
}

/** A bin location's record page; the Locations tab lists bins under their warehouse. */
export function BinLocationsTab(route: ListRoute) {
  // A warehouse page's "New bin" passes its warehouse.
  const [params] = useSearchParams();
  const startIn = params.get('warehouse');
  const { rows, save, setActive } = useCollectionRows(binLocations);
  const items = useAsync(listItems, [rows]) ?? [];

  return (
    <MasterList<BinLocation>
      {...route}
      icon="grid_view"
      title="Bin locations"
      noun="bin location"
      centered
      description="Storage positions in bin-enabled warehouses, coded Warehouse-Aisle-Shelf-Level. Items pick a default bin; transfers move stock between bins."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Bin code', cell: (b) => b.code },
        { key: 'description', header: 'Description', cell: (b) => b.description || '—' },
        {
          key: 'role',
          header: 'Role',
          sortable: false,
          cell: (b) => (
            <div className="flex flex-wrap gap-1">
              {b.receiving ? <Badge variant="outline">Receiving</Badge> : null}
              {b.excludeAutoAlloc ? <Badge variant="outline">Manual pick</Badge> : null}
            </div>
          ),
        },
        { key: 'restrictions', header: 'Restrictions', sortable: false, cell: (b) => restrictionSummary(b) || '—' },
        { key: 'stock', header: 'Item qty', cell: (b) => qty(binStock(b, items).qty) },
        { key: 'altSortCode', header: 'Sort code', cell: (b) => b.altSortCode || '—' },
        statusColumn<BinLocation>(),
      ]}
      sortValue={(b, key) =>
        key === 'stock'
          ? binStock(b, items).qty
          : key === 'active'
            ? Number(b.active)
            : String(b[key as keyof BinLocation] ?? '').toLowerCase()
      }
      searchText={(b) => `${b.code} ${b.description} ${b.barcode} ${b.altSortCode} ${restrictionSummary(b)}`}
      blank={() =>
        blankBin({
          id: newId('bin'),
          warehouse: binWarehouseOptions().find((o) => o.value === startIn)?.value ?? binWarehouseOptions()[0]?.value ?? '',
        })
      }
      label={(b) => b.code || 'New bin location'}
      validate={(b, all) => validateBin(b, all, items)}
      onSave={(b) =>
        save({
          ...b,
          code: binCode(b.warehouse, b.aisle, b.shelf, b.level),
          description: b.description.trim(),
          barcode: b.barcode.trim(),
          altSortCode: b.altSortCode.trim(),
          reason: b.reason.trim(),
          updatedAt: new Date().toISOString(),
        })
      }
      editor={(b, update, errors, isNew) => <BinEditor bin={b} update={update} errors={errors} isNew={isNew} items={items} />}
    />
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text weight="semibold" tone="heading" className="pt-2">
      {children}
    </Text>
  );
}

function BinEditor({
  bin: b,
  update,
  errors,
  isNew,
  items,
}: {
  bin: BinLocation;
  update: (patch: Partial<BinLocation>) => void;
  errors: Errors;
  isNew: boolean;
  items: Item[];
}) {
  // The code follows the address as it's picked.
  const set = (patch: Partial<BinLocation>) => {
    // Sublevel codes belong to a warehouse, so a new warehouse starts the address over.
    if (patch.warehouse !== undefined && patch.warehouse !== b.warehouse) patch = { ...patch, aisle: '', shelf: '', level: '' };
    const next = { ...b, ...patch };
    const complete = next.warehouse && next.aisle && next.shelf && next.level;
    update({ ...patch, code: complete ? binCode(next.warehouse, next.aisle, next.shelf, next.level) : '' });
  };
  const f = bind(b, set);
  const navigate = useNavigate();
  const stock = binStock(b, items);
  const binItems = b.code ? locationStock(items, b.warehouse, [b.code]) : [];
  const locked = isNew ? undefined : 'Change it with Modify bin codes on the list — the bin keeps its history and stock.';

  return (
    <>
      <Heading>Bin location address</Heading>
      <FieldStack>
        {isNew ? (
          f.choose('warehouse', 'Warehouse', binWarehouseOptions(b.warehouse), {
            required: true,
            error: errors.warehouse,
            hint: binWarehouseOptions().length ? 'Only warehouses with bin management on.' : 'Turn on bin management for a warehouse first.',
          })
        ) : (
          <ReadOnly label="Warehouse" value={b.warehouse} hint="A bin stays in its warehouse." />
        )}
        {SUBLEVEL_TIERS.map((t) =>
          isNew ? (
            <Fragment key={t}>
              {f.master(t, TIER_LABEL[t], sublevelDef, {
                required: true,
                error: errors[t],
                disabled: !b.warehouse,
                where: (s) => s.warehouse === b.warehouse && s.tier === t && s.active,
                seed: { warehouse: b.warehouse, tier: t },
                hint: b.warehouse ? undefined : 'Pick the warehouse first.',
              })}
            </Fragment>
          ) : (
            <ReadOnly key={t} label={TIER_LABEL[t]} value={b[t]} hint={t === 'aisle' ? locked : undefined} />
          ),
        )}
        <ReadOnly
          label="Bin location code"
          value={b.code || '—'}
          error={errors.code}
          hint="Warehouse-Aisle-Shelf-Level. Documents and items refer to the bin by this code."
        />
        {f.text('description', 'Description', { placeholder: 'e.g. Cold storage — 2–8 °C' })}
      </FieldStack>

      <Heading>Status and role</Heading>
      <FieldStack>{f.status('active', 'Status')}</FieldStack>
      <Flags>
        {f.check('receiving', 'Receiving bin')}
        {f.check('excludeAutoAlloc', 'Exclude from automatic allocation on issue')}
      </Flags>
      {errors.active || errors.receiving ? (
        <Text variant="small" tone="danger">
          {errors.active || errors.receiving}
        </Text>
      ) : (
        <Text variant="small" tone="muted">
          A receiving bin is where inbound stock lands before put-away; transfers into {b.warehouse || 'the warehouse'} default to it. Bins excluded from
          automatic allocation (quarantine, reserved stock) are only picked by hand.
        </Text>
      )}

      <Heading>Identification</Heading>
      <FieldStack>
        {f.text('barcode', 'Bar code', { hint: 'As printed on the bin label, for scanners.' })}
        {f.text('altSortCode', 'Alternative sort code', { hint: 'Orders pick and put-away lists by the walking route.' })}
      </FieldStack>

      <Heading>Current stock</Heading>
      <FieldStack>
        <ReadOnly label="Item qty" value={qty(stock.qty)} />
        <ReadOnly label="Item weight" value={`${qty(stock.weight)} kg`} />
        <ReadOnly label="No. of batches / serials" value="—" hint="Not tracked by bin yet." />
      </FieldStack>
      <Text variant="small" tone="muted">
        Per-bin quantities aren’t posted yet, so an item’s stock in {b.warehouse || 'a warehouse'} counts as sitting in its default bin there.
      </Text>
      {isNew ? null : (
        <DataTable
          icon="inventory_2"
          title={`Items with this default bin${binItems.length ? ` (${binItems.length})` : ''}`}
          rows={binItems}
          columns={stockColumns((r) => navigate(`/inventory/items/${encodeURIComponent(r.id)}`), false)}
          getRowId={(r) => r.id}
          noPagination
          empty={
            <Text variant="small" tone="muted">
              No item uses {b.code} as its default bin.
            </Text>
          }
        />
      )}

      <Heading>Capacity</Heading>
      <FieldStack>
        {f.num('minQty', 'Minimum qty', { error: errors.minQty, hint: 'For replenishment; not enforced. 0 = not set.' })}
        {f.num('maxQty', 'Maximum qty', {
          error: errors.maxQty,
          hint: b.maxQty && stock.qty > b.maxQty ? `Over capacity: ${qty(stock.qty)} in the bin.` : '0 = no limit.',
        })}
        {f.num('maxWeight', 'Maximum weight', {
          error: errors.maxWeight,
          suffix: 'kg',
          hint: b.maxWeight && stock.weight > b.maxWeight ? `Over the limit: ${qty(stock.weight)} kg in the bin.` : '0 = no limit.',
        })}
      </FieldStack>

      <Heading>Restrictions</Heading>
      <FieldStack>
        {f.choose('itemRestriction', 'Item restriction', ITEM_RESTRICTIONS)}
        {b.itemRestriction === 'item'
          ? f.lookup(
              'restrictedItem',
              'Item',
              items.filter((i) => i.inventoryItem).map((i) => ({ value: i.itemNo, label: `${i.itemNo} · ${i.name}` })),
              { required: true, error: errors.restrictedItem },
            )
          : b.itemRestriction === 'itemGroup'
            ? f.choose(
                'restrictedItemGroup',
                'Item group',
                itemGroups.snapshot().filter((g) => g.active || g.name === b.restrictedItemGroup).map((g) => ({ value: g.name, label: g.name })),
                { required: true, error: errors.restrictedItemGroup },
              )
            : null}
        {f.choose('uomRestriction', 'UoM restriction', UOM_RESTRICTIONS)}
        {b.uomRestriction === 'uom'
          ? f.master('restrictedUom', 'Unit of measure', uomDef, { required: true, error: errors.restrictedUom })
          : b.uomRestriction === 'uomGroup'
            ? f.choose(
                'restrictedUomGroup',
                'UoM group',
                uomGroups.snapshot().filter((g) => g.active || g.code === b.restrictedUomGroup).map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` })),
                { required: true, error: errors.restrictedUomGroup },
              )
            : null}
        {f.choose('batchRestriction', 'Batch restriction', BATCH_RESTRICTIONS)}
        {f.choose('transactionRestriction', 'Transaction restriction', TRANSACTION_RESTRICTIONS, {
          hint:
            b.transactionRestriction === 'transferAndCount'
              ? 'For quarantine: stock only moves by transfer, and can still be counted.'
              : 'Transfers check this: a from-bin must allow outbound, a to-bin inbound.',
        })}
      </FieldStack>

      <Heading>Audit trail</Heading>
      <FieldStack>
        <ReadOnly label="Last updated on" value={b.updatedAt ? UPDATED.format(new Date(b.updatedAt)) : '—'} hint="Set on every save." />
        {f.text('reason', 'Reason', { placeholder: 'Why this change, e.g. Deactivated — rack inspection', hint: 'Kept for the latest change only.' })}
      </FieldStack>
    </>
  );
}
