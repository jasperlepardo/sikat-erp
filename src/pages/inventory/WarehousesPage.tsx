import { useSearchParams } from 'react-router';
import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, bind } from '../../components/form/fields';
import { MasterList, type ListRoute } from '../../components/form/MasterList';
import { TabbedPage, type PageTab } from '../../components/form/TabbedPage';
import { AddressFields } from '../../components/form/AddressFields';
import { addressSummary, blankPostalAddress } from '../../mocks/address';
import { LOCATION_TYPES, type LocationType, type Warehouse } from '../../mocks/itemMasters';
import { warehouses } from '../../services/inventoryMasters';
import { listItems } from '../../services/items';
import { useAsync } from '../../services/useAsync';
import { useCollectionRows } from '../../services/useCollectionRows';
import { statusColumn, uniqueRequired } from '../settings/inventory/lists';
import { BinLocationsTab } from './bins/BinLocationsTab';
import { LocationsTab } from './bins/LocationsTab';
import { WarehouseContents } from './bins/WarehouseContents';
import { SublevelCodesTab } from './bins/sublevels';

const BASE = '/inventory/warehouses-and-bins';

const TABS: PageTab[] = [
  { value: 'locations', label: 'Locations', Component: LocationsTab },
  // Locations and bins are listed on Locations; these tabs hold their record pages.
  { value: 'warehouses', label: 'Locations', parent: 'locations', Component: WarehousesTab },
  { value: 'bin-locations', label: 'Bin locations', parent: 'locations', Component: BinLocationsTab },
  { value: 'sublevel-codes', label: 'Sublevel codes', Component: SublevelCodesTab },
];

/** Inventory › Warehouses & Bins: offices, warehouses (with their bin locations) and stores, and the codes bins are addressed by. */
export function WarehousesPage() {
  return (
    <TabbedPage
      base={BASE}
      icon="warehouse"
      title="Warehouses & Bins"
      subcopy="Offices bill, warehouses receive vendor shipments into bin locations, and stores sell stock restocked by transfer."
      tabs={TABS}
    />
  );
}

/** A location's record page (office, warehouse or store); the Locations tab lists them. */
function WarehousesTab(route: ListRoute) {
  // "New ▾" on Locations passes the type to start with.
  const [params] = useSearchParams();
  const newType = (LOCATION_TYPES.find((t) => t.value === params.get('type'))?.value ?? 'warehouse') as LocationType;
  const { rows, save, setActive } = useCollectionRows(warehouses);
  const items = useAsync(listItems, []) ?? [];
  const stockedItems = (w: Warehouse) => items.filter((i) => i.warehouses.some((x) => x.code === w.code)).length;
  const typeLabel = (t: LocationType) => LOCATION_TYPES.find((x) => x.value === t)?.label ?? t;
  return (
    <MasterList<Warehouse>
      {...route}
      icon="location_on"
      title="Locations"
      noun="location"
      related={(w, isNew) => <WarehouseContents warehouse={w} isNew={isNew} base={BASE} />}
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (w) => w.code },
        { key: 'name', header: 'Name', cell: (w) => w.name },
        { key: 'type', header: 'Type', cell: (w) => typeLabel(w.type) },
        { key: 'address', header: 'Address', cell: (w) => addressSummary(w.address) || '—' },
        statusColumn<Warehouse>(),
      ]}
      sortValue={(w, key) =>
        key === 'active'
          ? Number(w.active)
          : key === 'address'
            ? addressSummary(w.address).toLowerCase()
            : String(w[key as keyof Warehouse] ?? '').toLowerCase()
      }
      searchText={(w) => `${w.code} ${w.name} ${typeLabel(w.type)} ${addressSummary(w.address)}`}
      // The id is set from the code on save: the code is the key.
      blank={() => ({
        id: '',
        code: '',
        name: '',
        type: newType,
        address: blankPostalAddress(),
        binEnabled: newType === 'warehouse',
        active: true,
      })}
      label={(w) => `${w.code} · ${w.name}`}
      validate={(w, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, w, all, 'code', 'Code');
        if (!w.name.trim()) e.name = 'Name is required.';
        const stocked = stockedItems(w);
        if (w.type === 'office' && stocked)
          e.type = `${stocked} item${stocked === 1 ? ' is' : 's are'} stocked here — offices hold no stock. Remove ${w.code} from them first.`;
        return e;
      }}
      onSave={(w) => {
        const code = w.code.trim().toUpperCase();
        return save({ ...w, id: w.id || code, code, binEnabled: w.type === 'warehouse' });
      }}
      editor={(w, update, errors, isNew) => {
        const f = bind(w, update);
        return (
          <>
            <FieldStack>
              {f.text('code', 'Code', {
                required: true,
                error: errors.code,
                placeholder: 'e.g. WH-CDO',
                disabled: !isNew,
                hint: !isNew ? "Can't change once saved — documents refer to it. Deactivate instead." : undefined,
              })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.choose('type', 'Type', LOCATION_TYPES.map(({ value, label }) => ({ value, label })), {
                required: true,
                error: errors.type,
                hint: LOCATION_TYPES.find((t) => t.value === w.type)?.hint,
              })}
              <AddressFields value={w.address} onChange={(p) => update({ address: { ...w.address, ...p } })} unwrapped />
              {f.status('active', 'Status')}
            </FieldStack>
            <Text variant="small" tone="muted">
              {w.type === 'office'
                ? 'Address: purchase orders can print it as Bill To.'
                : w.type === 'warehouse'
                  ? 'Address: where vendors deliver. Purchase orders for this warehouse print it as Ship To.'
                  : 'Address: where the store is. Stock arrives by inventory transfer.'}
            </Text>
            {w.type === 'warehouse' ? (
              <Text variant="small" tone="muted">
                Warehouses keep stock in bin locations, so items stocked here need a default bin.
              </Text>
            ) : null}
          </>
        );
      }}
    />
  );
}
