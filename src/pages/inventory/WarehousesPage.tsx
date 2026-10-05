import { useNavigate } from 'react-router';
import { Link, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../components/form/fields';
import { MasterList, type ListRoute } from '../../components/form/MasterList';
import { useCollection } from '../../components/form/MasterLookup';
import { TabbedPage, type PageTab } from '../../components/form/TabbedPage';
import { AddressFields } from '../../components/form/AddressFields';
import { addressSummary, blankPostalAddress } from '../../mocks/address';
import type { Warehouse } from '../../mocks/itemMasters';
import { binLocations, warehouses } from '../../services/inventoryMasters';
import { newId, useCollectionRows } from '../../services/useCollectionRows';
import { statusColumn, uniqueRequired } from '../settings/inventory/lists';
import { BinLocationsTab } from './bins/BinLocationsTab';
import { SublevelCodesTab } from './bins/sublevels';

const BASE = '/inventory/warehouses-and-bins';

const TABS: PageTab[] = [
  { value: 'warehouses', label: 'Warehouses', Component: WarehousesTab },
  { value: 'bin-locations', label: 'Bin locations', Component: BinLocationsTab },
  { value: 'sublevel-codes', label: 'Sublevel codes', Component: SublevelCodesTab },
];

/** Inventory › Warehouses & Bins: warehouses, their bin locations and the codes bins are addressed by. */
export function WarehousesPage() {
  return (
    <TabbedPage
      base={BASE}
      icon="warehouse"
      title="Warehouses & Bins"
      subcopy="Where stock is kept. Bin-enabled warehouses hold stock in bin locations, and items stocked there need a default bin."
      tabs={TABS}
    />
  );
}

function WarehousesTab(route: ListRoute) {
  const navigate = useNavigate();
  const { rows, save, setActive } = useCollectionRows(warehouses);
  const bins = useCollection(binLocations) ?? [];
  const binCount = (w: Warehouse) => bins.filter((b) => b.warehouse === w.code).length;
  return (
    <MasterList<Warehouse>
      {...route}
      icon="warehouse"
      title="Warehouses"
      noun="warehouse"
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (w) => w.code },
        { key: 'name', header: 'Name', cell: (w) => w.name },
        { key: 'address', header: 'Address', cell: (w) => addressSummary(w.address) || '—' },
        {
          key: 'bins',
          header: 'Bins',
          cell: (w) => (w.binEnabled ? `${binCount(w)} bin${binCount(w) === 1 ? '' : 's'}` : 'No bin management'),
        },
        statusColumn<Warehouse>(),
      ]}
      sortValue={(w, key) =>
        key === 'bins'
          ? w.binEnabled
            ? binCount(w)
            : -1
          : key === 'active'
            ? Number(w.active)
            : key === 'address'
              ? addressSummary(w.address).toLowerCase()
              : String(w[key as keyof Warehouse] ?? '').toLowerCase()
      }
      searchText={(w) => `${w.code} ${w.name} ${addressSummary(w.address)}`}
      blank={() => ({ id: newId('wh'), code: '', name: '', address: blankPostalAddress(), binEnabled: false, active: true })}
      label={(w) => `${w.code} · ${w.name}`}
      validate={(w, all) => {
        const e: Record<string, string> = {};
        uniqueRequired(e, w, all, 'code', 'Code');
        if (!w.name.trim()) e.name = 'Name is required.';
        return e;
      }}
      onSave={(w) => save({ ...w, code: w.code.trim().toUpperCase() })}
      editor={(w, update, errors, isNew) => {
        const f = bind(w, update);
        const count = binCount(w);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', {
                required: true,
                error: errors.code,
                placeholder: 'e.g. WH-CDO',
                disabled: !isNew,
                hint: !isNew ? "Can't change once saved — items refer to it. Deactivate instead." : undefined,
              })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
            </Fields>
            <Text variant="small" tone="muted">
              Address: where goods are delivered. Purchase orders for this warehouse print it as Ship To.
            </Text>
            <Fields cols={3}>
              <AddressFields value={w.address} onChange={(p) => update({ address: { ...w.address, ...p } })} />
            </Fields>
            <Flags>
              {f.check('binEnabled', 'Bin management (items need a default bin here)')}
              {f.check('active', 'Active')}
            </Flags>
            {w.binEnabled ? (
              <Text variant="small" tone="muted">
                {isNew ? 'Save the warehouse, then add its bins' : count ? `${count} bin location${count === 1 ? '' : 's'} — manage them` : 'No bins yet — add them'}{' '}
                on the{' '}
                <Link onClick={() => navigate(`${BASE}/bin-locations`)}>Bin locations</Link> tab (Generate bins creates a whole rack at once).
              </Text>
            ) : count ? (
              <Text variant="small" tone="muted">
                Its {count} bin{count === 1 ? '' : 's'} are kept but not offered while bin management is off.
              </Text>
            ) : null}
          </>
        );
      }}
    />
  );
}
