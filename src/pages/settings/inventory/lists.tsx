/**
 * Settings › Inventory lists. Each is a MasterList over one inventory master-data
 * collection; the item master reads them (services/inventoryMasters.ts).
 */
import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  COGS_ACCOUNTS,
  INVENTORY_ACCOUNTS,
  MAX_ITEM_PROPERTIES,
  REVENUE_ACCOUNTS,
  VALUATION_METHODS,
  type CommissionGroup,
  type CustomsGroup,
  type ItemGroup,
  type ItemProperty,
  type Manufacturer,
  type ShippingType,
  type UnitOfMeasure,
  type WarrantyTemplate,
} from '../../../mocks/itemMasters';
import { COUNTRIES } from '../../../mocks/masters';
import {
  commissionGroups,
  customsGroups,
  itemGroups,
  itemProperties,
  manufacturers,
  shippingTypes,
  unitsOfMeasure,
  warrantyTemplates,
} from '../../../services/inventoryMasters';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

type Errors = Record<string, string>;

export const statusColumn = <T extends { active: boolean }>() => ({
  key: 'active',
  header: 'Status',
  cell: (r: T) => <TableStatus intent={r.active ? 'success' : 'default'}>{r.active ? 'Active' : 'Inactive'}</TableStatus>,
});

/** "is required" + "already exists" check on one text field. */
export function uniqueRequired<T extends { id: string }>(
  e: Errors,
  row: T,
  all: T[],
  key: keyof T & string,
  label: string,
) {
  const v = String(row[key] ?? '').trim();
  if (!v) e[key] = `${label} is required.`;
  else if (all.some((x) => x.id !== row.id && String(x[key]).trim().toLowerCase() === v.toLowerCase())) e[key] = `${v} already exists.`;
}

export function ItemGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(itemGroups);
  return (
    <MasterList<ItemGroup>
      {...route}
      icon="category"
      title="Item groups"
      noun="item group"
      description="Groups set an item's numbering prefix, default valuation method and G/L accounts."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Group', cell: (g) => g.name },
        { key: 'prefix', header: 'Item No. prefix', cell: (g) => `${g.prefix}-#####` },
        { key: 'valuationMethod', header: 'Valuation', cell: (g) => g.valuationMethod },
        { key: 'inventoryAccount', header: 'Inventory account', cell: (g) => g.inventoryAccount },
        statusColumn<ItemGroup>(),
      ]}
      searchText={(g) => `${g.name} ${g.prefix} ${g.valuationMethod}`}
      blank={() => ({
        id: newId('ig'),
        name: '',
        prefix: '',
        valuationMethod: 'Moving Average',
        inventoryAccount: INVENTORY_ACCOUNTS[0],
        cogsAccount: COGS_ACCOUNTS[0],
        revenueAccount: REVENUE_ACCOUNTS[0],
        active: true,
      })}
      label={(g) => g.name}
      validate={(g, all) => {
        const e: Errors = {};
        uniqueRequired(e, g, all, 'name', 'Name');
        if (!/^[A-Z0-9]{2,5}$/.test(g.prefix.trim().toUpperCase())) e.prefix = 'Use 2–5 letters or digits, e.g. FST.';
        else if (all.some((x) => x.id !== g.id && x.prefix.toUpperCase() === g.prefix.trim().toUpperCase()))
          e.prefix = `${g.prefix.toUpperCase()} is used by another group.`;
        return e;
      }}
      onSave={(g) => save({ ...g, prefix: g.prefix.trim().toUpperCase() })}
      editor={(g, update, errors, isNew) => {
        const f = bind(g, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('name', 'Name', { required: true, error: errors.name, readOnly: !isNew, hint: isNew ? undefined : 'Can’t change once saved — items refer to it. Deactivate instead.' })}
              {f.text('prefix', 'Item No. prefix', { required: true, error: errors.prefix, hint: 'Auto-numbered items become PREFIX-00001.' })}
              {f.pick('valuationMethod', 'Default valuation method', VALUATION_METHODS)}
              {f.pick('inventoryAccount', 'Inventory account', INVENTORY_ACCOUNTS)}
              {f.pick('cogsAccount', 'Cost of goods sold account', COGS_ACCOUNTS)}
              {f.pick('revenueAccount', 'Revenue account', REVENUE_ACCOUNTS)}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function UnitsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(unitsOfMeasure);
  return (
    <MasterList<UnitOfMeasure>
      {...route}
      icon="straighten"
      title="Units of measure"
      noun="unit of measure"
      description="Units items are stocked, bought and sold in. Items convert purchasing and sales units to their inventory unit."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (u) => u.code },
        { key: 'name', header: 'Name', cell: (u) => u.name },
        statusColumn<UnitOfMeasure>(),
      ]}
      searchText={(u) => `${u.code} ${u.name}`}
      blank={() => ({ id: newId('uom'), code: '', name: '', active: true })}
      label={(u) => `${u.code} · ${u.name}`}
      validate={(u, all) => {
        const e: Errors = {};
        uniqueRequired(e, u, all, 'code', 'Code');
        if (!u.name.trim()) e.name = 'Name is required.';
        return e;
      }}
      onSave={(u) => save({ ...u, code: u.code.trim() })}
      editor={(u, update, errors, isNew) => {
        const f = bind(u, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. carton', readOnly: !isNew, hint: isNew ? undefined : 'Can’t change once saved — items refer to it. Deactivate instead.' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function ManufacturersTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(manufacturers);
  return (
    <MasterList<Manufacturer>
      {...route}
      icon="factory"
      title="Manufacturers"
      noun="manufacturer"
      description="Who makes an item — separate from the vendor you buy it from."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Code', cell: (m) => m.code },
        { key: 'name', header: 'Name', cell: (m) => m.name },
        { key: 'country', header: 'Country', cell: (m) => m.country || '—' },
        { key: 'contactPerson', header: 'Contact', cell: (m) => [m.contactPerson, m.email].filter(Boolean).join(' · ') || '—' },
        statusColumn<Manufacturer>(),
      ]}
      searchText={(m) => `${m.code} ${m.name} ${m.country} ${m.contactPerson}`}
      blank={() => ({ id: newId('mfr'), code: '', name: '', country: 'Philippines', contactPerson: '', email: '', phone: '', active: true })}
      label={(m) => `${m.code} · ${m.name}`}
      validate={(m, all) => {
        const e: Errors = {};
        uniqueRequired(e, m, all, 'code', 'Code');
        if (!m.name.trim()) e.name = 'Name is required.';
        if (m.email && !/^\S+@\S+\.\S+$/.test(m.email)) e.email = 'Enter a valid email address.';
        return e;
      }}
      onSave={(m) => save({ ...m, code: m.code.trim().toUpperCase() })}
      editor={(m, update, errors, isNew) => {
        const f = bind(m, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. MFR-007', readOnly: !isNew, hint: isNew ? undefined : 'Can’t change once saved — items refer to it. Deactivate instead.' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.pick('country', 'Country', COUNTRIES)}
              {f.text('contactPerson', 'Contact person')}
              {f.text('email', 'Email', { type: 'email', error: errors.email })}
              {f.text('phone', 'Phone', { type: 'tel' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function CustomsGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(customsGroups);
  return (
    <MasterList<CustomsGroup>
      {...route}
      icon="gavel"
      title="Customs groups"
      noun="customs group"
      description="Import duty by tariff heading. Picking a customs group on an item sets its duty % for landed cost."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Name', cell: (c) => c.name },
        { key: 'hsCode', header: 'HS heading', cell: (c) => c.hsCode || '—' },
        { key: 'duty', header: 'Duty', cell: (c) => `${c.duty}%` },
        statusColumn<CustomsGroup>(),
      ]}
      searchText={(c) => `${c.name} ${c.hsCode}`}
      blank={() => ({ id: newId('cg'), name: '', hsCode: '', duty: 0, active: true })}
      label={(c) => c.name}
      validate={(c, all) => {
        const e: Errors = {};
        uniqueRequired(e, c, all, 'name', 'Name');
        if (c.duty < 0 || c.duty > 100) e.duty = 'Duty must be between 0 and 100.';
        return e;
      }}
      onSave={save}
      editor={(c, update, errors) => {
        const f = bind(c, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.text('hsCode', 'HS heading', { placeholder: 'e.g. 7318', hint: 'AHTN / Harmonized System heading.' })}
              {f.num('duty', 'Duty', { suffix: '%', error: errors.duty, hint: 'Confirm against the current Customs tariff.' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function CommissionGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(commissionGroups);
  return (
    <MasterList<CommissionGroup>
      {...route}
      icon="paid"
      title="Commission groups"
      noun="commission group"
      description="Sales commission by item. Picking a group on an item sets its commission %."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Name', cell: (c) => c.name },
        { key: 'pct', header: 'Commission', cell: (c) => `${c.pct}%` },
        statusColumn<CommissionGroup>(),
      ]}
      searchText={(c) => c.name}
      blank={() => ({ id: newId('cm'), name: '', pct: 0, active: true })}
      label={(c) => c.name}
      validate={(c, all) => {
        const e: Errors = {};
        uniqueRequired(e, c, all, 'name', 'Name');
        if (c.pct < 0 || c.pct > 100) e.pct = 'Commission must be between 0 and 100.';
        return e;
      }}
      onSave={save}
      editor={(c, update, errors) => {
        const f = bind(c, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.num('pct', 'Commission', { suffix: '%', error: errors.pct })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function ShippingTypesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(shippingTypes);
  return (
    <MasterList<ShippingType>
      {...route}
      icon="local_shipping"
      title="Shipping types"
      noun="shipping type"
      description="Delivery methods defaulted from items and business partners onto documents."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Name', cell: (x) => x.name },
        { key: 'trackingUrl', header: 'Tracking page', cell: (x) => x.trackingUrl || '—' },
        statusColumn<ShippingType>(),
      ]}
      searchText={(x) => x.name}
      blank={() => ({ id: newId('sh'), name: '', trackingUrl: '', active: true })}
      label={(x) => x.name}
      validate={(x, all) => {
        const e: Errors = {};
        uniqueRequired(e, x, all, 'name', 'Name');
        if (x.trackingUrl && !/^https?:\/\//.test(x.trackingUrl)) e.trackingUrl = 'Start the address with https://';
        return e;
      }}
      onSave={save}
      editor={(x, update, errors) => {
        const f = bind(x, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.text('trackingUrl', 'Tracking page', { type: 'url', error: errors.trackingUrl, placeholder: 'https://', className: 'md:col-span-2' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function WarrantyTemplatesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(warrantyTemplates);
  return (
    <MasterList<WarrantyTemplate>
      {...route}
      icon="verified_user"
      title="Warranty templates"
      noun="warranty template"
      description="Warranty terms assigned to serial-numbered items when they're sold."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Name', cell: (w) => w.name },
        { key: 'months', header: 'Period', cell: (w) => `${w.months} month${w.months === 1 ? '' : 's'}` },
        { key: 'coverage', header: 'Coverage', cell: (w) => w.coverage },
        statusColumn<WarrantyTemplate>(),
      ]}
      searchText={(w) => `${w.name} ${w.coverage}`}
      blank={() => ({ id: newId('wr'), name: '', months: 12, coverage: 'Parts', active: true })}
      label={(w) => w.name}
      validate={(w, all) => {
        const e: Errors = {};
        uniqueRequired(e, w, all, 'name', 'Name');
        if (w.months <= 0) e.months = 'Enter the warranty period in months.';
        return e;
      }}
      onSave={save}
      editor={(w, update, errors) => {
        const f = bind(w, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.num('months', 'Period', { suffix: 'months', error: errors.months })}
              {f.pick('coverage', 'Coverage', ['Parts', 'Parts & labor', 'Manufacturer'])}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}

export function ItemPropertiesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(itemProperties);
  const groups = [...new Set((rows ?? []).map((p) => p.group).filter(Boolean))];
  const nextNumber = () => {
    const used = new Set((rows ?? []).map((p) => p.number));
    for (let n = 1; n <= MAX_ITEM_PROPERTIES; n++) if (!used.has(n)) return n;
    return 0;
  };
  return (
    <MasterList<ItemProperty>
      {...route}
      icon="label"
      title="Item properties"
      noun="item property"
      description={`Up to ${MAX_ITEM_PROPERTIES} yes/no flags for filtering items, grouped for display. ${(rows ?? []).length} of ${MAX_ITEM_PROPERTIES} used.`}
      rows={rows}
      onSetActive={setActive}
      defaultSort={{ key: 'number', direction: 'asc' }}
      columns={[
        { key: 'number', header: 'No.', cell: (p) => `Property ${p.number}` },
        { key: 'name', header: 'Name', cell: (p) => p.name },
        { key: 'group', header: 'Property group', cell: (p) => p.group || '—' },
        statusColumn<ItemProperty>(),
      ]}
      searchText={(p) => `${p.number} ${p.name} ${p.group}`}
      blank={() => ({ id: newId('prop'), number: nextNumber(), name: '', group: groups[0] ?? '', active: true })}
      label={(p) => `Property ${p.number} · ${p.name}`}
      validate={(p, all) => {
        const e: Errors = {};
        uniqueRequired(e, p, all, 'name', 'Name');
        if (!Number.isInteger(p.number) || p.number < 1 || p.number > MAX_ITEM_PROPERTIES)
          e.number = all.length >= MAX_ITEM_PROPERTIES ? `All ${MAX_ITEM_PROPERTIES} properties are in use.` : `Use a number from 1 to ${MAX_ITEM_PROPERTIES}.`;
        else if (all.some((x) => x.id !== p.id && x.number === p.number)) e.number = `Property ${p.number} is already defined.`;
        return e;
      }}
      onSave={save}
      editor={(p, update, errors) => {
        const f = bind(p, update);
        return (
          <>
            <Fields cols={3}>
              {f.num('number', 'Property no.', { error: errors.number, hint: `1–${MAX_ITEM_PROPERTIES}` })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.text('group', 'Property group', {
                placeholder: groups.join(', ') || 'e.g. Compliance',
                hint: 'Type an existing group or a new one.',
              })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
