import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, bind, type Errors } from '../../../components/form/fields';
import { statusColumn } from '../../../components/form/MasterList';
import { MasterDefList, type MasterDef } from '../../../components/form/MasterLookup';
import type { ListRoute } from '../../../components/form/MasterList';
import { SUBLEVEL_TIERS, TIER_LABEL, type BinSublevel, type SublevelTier } from '../../../mocks/binLocations';
import { binLocations, binSublevels, warehouses } from '../../../services/inventoryMasters';
import { newId } from '../../../services/useCollectionRows';

const HOME = 'Inventory › Warehouses & Bins';

/** Bin-enabled warehouses (plus `current`), as picker options. */
export const binWarehouseOptions = (current = '') =>
  warehouses
    .snapshot()
    .filter((w) => (w.active && w.binEnabled) || w.code === current)
    .map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` }));

/** How many bins use a sublevel code. */
export const binsUsing = (s: Pick<BinSublevel, 'warehouse' | 'tier' | 'code'>) =>
  binLocations.snapshot().filter((b) => b.warehouse === s.warehouse && b[s.tier] === s.code).length;

/** Aisle, shelf and level codes, per warehouse. Bins are addressed by one of each. */
export const sublevelDef: MasterDef<BinSublevel> = {
  collection: binSublevels,
  icon: 'view_column',
  title: 'Sublevel codes',
  noun: 'sublevel code',
  home: HOME,
  description: 'The aisle, shelf and level codes each warehouse’s bins are addressed by. A bin code joins one of each: WH-MNL-A-01-02.',
  blank: (code) => ({
    id: newId('bsl'),
    warehouse: binWarehouseOptions()[0]?.value ?? '',
    tier: 'aisle',
    code,
    description: '',
    active: true,
  }),
  value: (s) => s.code,
  label: (s) => (s.description ? `${s.code} · ${s.description}` : s.code),
  columns: [
    { key: 'code', header: 'Code', cell: (s) => s.code },
    { key: 'warehouse', header: 'Warehouse', cell: (s) => s.warehouse },
    { key: 'tier', header: 'Sublevel', cell: (s) => TIER_LABEL[s.tier] },
    { key: 'description', header: 'Description', cell: (s) => s.description || '—' },
    { key: 'bins', header: 'Bin locations', cell: (s) => binsUsing(s), sortable: false },
    statusColumn<BinSublevel>(),
  ],
  searchText: (s) => `${s.warehouse} ${TIER_LABEL[s.tier]} ${s.code} ${s.description}`,
  normalize: (s) => ({ ...s, code: s.code.trim().toUpperCase(), description: s.description.trim() }),
  validate: (s, all) => {
    const e: Errors = {};
    const code = s.code.trim().toUpperCase();
    if (!s.warehouse) e.warehouse = 'Pick a bin-enabled warehouse.';
    if (!code) e.code = 'Code is required.';
    else if (code.includes('-')) e.code = 'Codes can’t contain “-”: it separates the parts of a bin code.';
    else if (all.some((x) => x.id !== s.id && x.warehouse === s.warehouse && x.tier === s.tier && x.code.toUpperCase() === code))
      e.code = `${TIER_LABEL[s.tier]} ${code} already exists in ${s.warehouse}.`;
    return e;
  },
  editor: (s, update, errors, isNew) => {
    const f = bind(s, update);
    const used = isNew ? 0 : binsUsing(s);
    return (
      <>
        <Fields cols={3}>
          {isNew
            ? f.choose('warehouse', 'Warehouse', binWarehouseOptions(s.warehouse), { required: true, error: errors.warehouse })
            : <ReadOnly label="Warehouse" value={s.warehouse} />}
          {isNew
            ? f.choose('tier', 'Sublevel', SUBLEVEL_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })), { required: true })
            : <ReadOnly label="Sublevel" value={TIER_LABEL[s.tier as SublevelTier]} />}
          {f.text('code', 'Code', {
            required: true,
            error: errors.code,
            placeholder: 'e.g. A, 01, L1',
            disabled: !isNew,
            hint: isNew ? undefined : 'Bins are coded with it. Rename it with Modify bin codes on Bin locations.',
          })}
          {f.text('description', 'Description', { placeholder: 'e.g. Aisle A · iPhone & iPad' })}
          {!isNew ? <ReadOnly label="Bin locations" value={String(used)} /> : null}
        </Fields>
        <Flags>{f.check('active', 'Active')}</Flags>
        {!s.active && used ? (
          <Text variant="small" tone="muted">
            Inactive codes aren’t offered for new bins; the {used} bin{used === 1 ? '' : 's'} using it keep it.
          </Text>
        ) : null}
      </>
    );
  },
};

export const SublevelCodesTab = (route: ListRoute) => <MasterDefList def={sublevelDef} {...route} />;
