/**
 * Settings › Inventory lists. Each is a MasterList over one inventory master-data
 * collection; the item master reads them (services/inventoryMasters.ts).
 */
import { Button, Icon, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { FieldStack, bind } from '../../../components/form/fields';
import { MasterList, statusColumn, uniqueRequired, type ListRoute } from '../../../components/form/MasterList';
import { MasterDefList, MasterLookup } from '../../../components/form/MasterLookup';
import { manufacturerDef, shippingTypeDef, uomDef, warrantyTemplateDef } from '../masterDefs';
import { AccountField, useAccounts } from '../../../components/form/AccountField';
import { accountProblem, accountText } from '../../../mocks/chartOfAccounts';
import {
  MAX_ITEM_PROPERTIES,
  VALUATION_METHODS,
  conversionSummary,
  type CommissionGroup,
  type CustomsGroup,
  type ItemGroup,
  type ItemProperty,
  type UomConversion,
  type UomGroup,
} from '../../../mocks/itemMasters';
import {
  commissionGroups,
  customsGroups,
  itemGroups,
  itemProperties,
  uomGroups,
} from '../../../services/inventoryMasters';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { exciseCategories, taxGroups, withholdingGroups } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { taxGroupOptions, withholdingGroupOptions, type TaxMasters } from '../../inventory/items/detail/types';

type Errors = Record<string, string>;

export { statusColumn, uniqueRequired };

export function ItemGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(itemGroups);
  const chart = useAccounts();
  const tax = useAsync(
    () =>
      Promise.all([taxGroups.list(), exciseCategories.list(), withholdingGroups.list()]).then(
        ([groups, excise, wGroups]): TaxMasters => ({ groups, codes: [], excise, withholdingGroups: wGroups }),
      ),
    [],
  );
  return (
    <MasterList<ItemGroup>
      {...route}
      icon="category"
      title="Item groups"
      noun="item group"
      description="Groups set an item's numbering prefix, default valuation method, G/L accounts and tax defaults (withholding, excise)."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'name', header: 'Group', cell: (g) => g.name },
        { key: 'prefix', header: 'Item No. prefix', cell: (g) => `${g.prefix}-#####` },
        { key: 'valuationMethod', header: 'Valuation', cell: (g) => g.valuationMethod },
        { key: 'inventoryAccount', header: 'Inventory account', cell: (g) => accountText(g.inventoryAccount, chart) },
        { key: 'revenueAccount', header: 'Revenue account', cell: (g) => accountText(g.revenueAccount, chart) },
        { key: 'withholdingGroup', header: 'Withholding', cell: (g) => g.withholdingGroup || '—' },
        { key: 'exciseCategory', header: 'Excise', cell: (g) => g.exciseCategory || '—' },
        statusColumn<ItemGroup>(),
      ]}
      searchText={(g) => `${g.name} ${g.prefix} ${g.valuationMethod}`}
      blank={() => ({
        id: newId('ig'),
        name: '',
        prefix: '',
        valuationMethod: 'Moving Average',
        inventoryAccount: '1310',
        cogsAccount: '5010',
        revenueAccount: '4010',
        purchaseTaxGroup: 'P-VAT12',
        salesTaxGroup: 'S-VAT12',
        withholdingGroup: 'WH-GDS',
        exciseCategory: '',
        active: true,
      })}
      label={(g) => g.name}
      validate={(g, all) => {
        const e: Errors = {};
        uniqueRequired(e, g, all, 'name', 'Name');
        if (!/^[A-Z0-9]{2,5}$/.test(g.prefix.trim().toUpperCase())) e.prefix = 'Use 2–5 letters or digits, e.g. FST.';
        else if (all.some((x) => x.id !== g.id && x.prefix.toUpperCase() === g.prefix.trim().toUpperCase()))
          e.prefix = `${g.prefix.toUpperCase()} is used by another group.`;
        const accountErrors = {
          inventoryAccount: accountProblem(g.inventoryAccount, 'inventory', chart ?? []),
          cogsAccount: accountProblem(g.cogsAccount, 'cogs', chart ?? [], true),
          revenueAccount: accountProblem(g.revenueAccount, 'revenue', chart ?? [], true),
        };
        for (const [k, v] of Object.entries(accountErrors)) if (v && chart) e[k] = v;
        if (tax) {
          const missing = (code: string, list: { code: string; active: boolean }[]) =>
            !!code && !list.some((x) => x.code === code && x.active);
          if (missing(g.purchaseTaxGroup, tax.groups)) e.purchaseTaxGroup = `${g.purchaseTaxGroup} is missing or inactive.`;
          if (missing(g.salesTaxGroup, tax.groups)) e.salesTaxGroup = `${g.salesTaxGroup} is missing or inactive.`;
          if (missing(g.withholdingGroup, tax.withholdingGroups)) e.withholdingGroup = `${g.withholdingGroup} is missing or inactive.`;
          if (missing(g.exciseCategory, tax.excise)) e.exciseCategory = `${g.exciseCategory} is missing or inactive.`;
        }
        return e;
      }}
      onSave={(g) => save({ ...g, prefix: g.prefix.trim().toUpperCase() })}
      editor={(g, update, errors, isNew) => {
        const f = bind(g, update);
        return (
          <>
            <FieldStack>
              {f.text('name', 'Name', { required: true, error: errors.name, disabled: !isNew, hint: !isNew ? "Can't change once saved — items refer to it. Deactivate instead." : undefined })}
              {f.text('prefix', 'Item No. prefix', { required: true, error: errors.prefix, hint: 'Auto-numbered items become PREFIX-00001.' })}
              {f.pick('valuationMethod', 'Default valuation method', VALUATION_METHODS)}
              <AccountField
                label="Inventory account"
                role="inventory"
                accounts={chart}
                allowNone
                hint="None for non-stock groups (services, gift certificates)."
                error={errors.inventoryAccount}
                value={g.inventoryAccount}
                onChange={(inventoryAccount) => update({ inventoryAccount })}
              />
              <AccountField
                label="Cost of goods sold account"
                role="cogs"
                accounts={chart}
                required
                error={errors.cogsAccount}
                value={g.cogsAccount}
                onChange={(cogsAccount) => update({ cogsAccount })}
              />
              <AccountField
                label="Revenue account"
                role="revenue"
                accounts={chart}
                required
                error={errors.revenueAccount}
                value={g.revenueAccount}
                onChange={(revenueAccount) => update({ revenueAccount })}
              />
              {f.lookup('purchaseTaxGroup', 'Purchase tax group', tax ? taxGroupOptions(tax, 'Purchase', g.purchaseTaxGroup) : [], {
                clearable: true,
                error: errors.purchaseTaxGroup,
              })}
              {f.lookup('salesTaxGroup', 'Sales tax group', tax ? taxGroupOptions(tax, 'Sales', g.salesTaxGroup) : [], {
                clearable: true,
                error: errors.salesTaxGroup,
              })}
              {f.lookup('withholdingGroup', 'Withholding group', tax ? withholdingGroupOptions(tax, g.withholdingGroup) : [], {
                clearable: true,
                error: errors.withholdingGroup,
                hint: 'E.g. WH-RENT for rent, WH-PROF for professional fees.',
              })}
              {f.lookup(
                'exciseCategory',
                'Excise category',
                (tax?.excise ?? [])
                  .filter((x) => x.active || x.code === g.exciseCategory)
                  .map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
                {
                  clearable: true,
                  error: errors.exciseCategory,
                  hint: 'Leave empty unless every item in the group is excisable (tobacco, alcohol, fuel…).',
                },
              )}
              {f.check('active', 'Active')}
            </FieldStack>
            <Text variant="small" tone="muted">
              Tax defaults are copied onto an item when it's created in or moved to this group. Each item can still change them.
            </Text>
          </>
        );
      }}
    />
  );
}

const convKey = (c: UomConversion, field: keyof UomConversion) => `conv:${c.id}:${field}`;

export function UomGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(uomGroups);

  return (
    <MasterList<UomGroup>
      {...route}
      icon="scale"
      title="UoM groups"
      noun="UoM group"
      description="Templates of related units and how they convert. On an item, “Add from UoM group” copies a group's units in; changing a group later doesn't change items."
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'code', header: 'Group', cell: (g) => g.code },
        { key: 'name', header: 'Description', cell: (g) => g.name },
        { key: 'baseUom', header: 'Base UoM', cell: (g) => g.baseUom || '—' },
        { key: 'conversions', header: 'Conversions', cell: conversionSummary },
        statusColumn<UomGroup>(),
      ]}
      sortValue={(g, key) => (key === 'conversions' ? conversionSummary(g) : String(g[key as keyof UomGroup] ?? ''))}
      searchText={(g) => `${g.code} ${g.name} ${g.baseUom} ${g.conversions.map((c) => c.altUom).join(' ')}`}
      blank={() => ({ id: newId('ug'), code: '', name: '', baseUom: 'pc', conversions: [], active: true })}
      label={(g) => g.code}
      validate={(g, all) => {
        const e: Errors = {};
        uniqueRequired(e, g, all, 'code', 'Group');
        if (g.code.trim().length > 20) e.code = 'Use at most 20 characters.';
        if (!g.name.trim()) e.name = 'Description is required.';
        if (!g.baseUom) e.baseUom = 'Pick the base unit.';
        const seen = new Set<string>();
        for (const c of g.conversions) {
          if (!c.altUom) e[convKey(c, 'altUom')] = 'Pick a unit.';
          else if (c.altUom === g.baseUom) e[convKey(c, 'altUom')] = `${c.altUom} is the base unit.`;
          else if (seen.has(c.altUom)) e[convKey(c, 'altUom')] = `${c.altUom} is listed twice.`;
          seen.add(c.altUom);
          if (!(c.altQty > 0)) e[convKey(c, 'altQty')] = 'Enter more than 0.';
          if (!(c.baseQty > 0)) e[convKey(c, 'baseQty')] = 'Enter more than 0.';
        }
        return e;
      }}
      onSave={(g) => save({ ...g, code: g.code.trim().toUpperCase(), name: g.name.trim() })}
      editor={(g, update, errors, isNew) => {
        const f = bind(g, update);
        const patchConv = (id: string, p: Partial<UomConversion>) =>
          update({ conversions: g.conversions.map((c) => (c.id === id ? { ...c, ...p } : c)) });
        const err = (c: UomConversion, field: keyof UomConversion) =>
          errors[convKey(c, field)] ? (
            <Text variant="caption" tone="danger" className="mt-1">
              {errors[convKey(c, field)]}
            </Text>
          ) : null;
        const qty = (c: UomConversion, field: 'altQty' | 'baseQty', label: string) => (
          <div className="w-28">
            <TextField
              aria-label={label}
              type="number"
              min={0}
              invalid={!!errors[convKey(c, field)]}
              value={String(c[field])}
              onChange={(e) => patchConv(c.id, { [field]: Number(e.currentTarget.value) })}
            />
            {err(c, field)}
          </div>
        );
        const columns: TableColumn<UomConversion>[] = [
          { key: 'altQty', header: 'Alt. qty', cell: (c) => qty(c, 'altQty', 'Alternative quantity') },
          {
            key: 'altUom',
            header: 'Alt. UoM',
            cell: (c) => (
              <div className="w-44">
                <MasterLookup
                  def={uomDef}
                  fieldProps={{ 'aria-label': 'Alternative unit', invalid: !!errors[convKey(c, 'altUom')] }}
                  value={c.altUom}
                  onChange={(altUom) => patchConv(c.id, { altUom })}
                />
                {err(c, 'altUom')}
              </div>
            ),
          },
          { key: 'equals', header: '', cell: () => <span className="text-muted">=</span> },
          { key: 'baseQty', header: 'Base qty', cell: (c) => qty(c, 'baseQty', 'Base quantity') },
          { key: 'baseUom', header: 'Base UoM', cell: () => g.baseUom || '—' },
        ];
        return (
          <>
            <FieldStack>
              {f.text('code', 'Group', {
                required: true,
                error: errors.code,
                placeholder: 'e.g. PIECE',
                disabled: !isNew,
                hint: !isNew ? "Can't change once saved. Deactivate instead." : 'Up to 20 characters.',
              })}
              {f.text('name', 'Description', { required: true, error: errors.name, placeholder: 'e.g. Piece (each / box / carton)' })}
              {f.master('baseUom', 'Base UoM', uomDef, {
                required: true,
                error: errors.baseUom,
                hint: 'Every conversion is expressed in this unit.',
              })}
            </FieldStack>
            <DataTable
              icon="swap_horiz"
              title="Conversions"
              description={`Read each row as “1 box = 24 ${g.baseUom || 'pc'}”. Factors between two alternatives follow from these (1 carton = 2 box when carton = 48 and box = 24).`}
              rows={g.conversions}
              getRowId={(c) => c.id}
              columns={columns}
              unsortable={columns.map((c) => c.key)}
              onRemove={(picked) => update({ conversions: g.conversions.filter((c) => !picked.includes(c)) })}
              actions={
                <Button
                  type="button"
                  size="small"
                  intent="primary"
                  variant="solid"
                  aria-label="New conversion"
                  leadingIcon={<Icon size={16}>add</Icon>}
                  onClick={() => update({ conversions: [...g.conversions, { id: newId('uc'), altQty: 1, altUom: '', baseQty: 1 }] })}
                >
                  New
                </Button>
              }
              empty={
                <Text variant="small" tone="muted">
                  No conversions — the group has {g.baseUom || 'the base unit'} only.
                </Text>
              }
            />
            <FieldStack>{f.check('active', 'Active')}</FieldStack>
          </>
        );
      }}
    />
  );
}

export const UnitsTab = (route: ListRoute) => <MasterDefList def={uomDef} {...route} />;

export const ManufacturersTab = (route: ListRoute) => <MasterDefList def={manufacturerDef} {...route} />;

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
          <FieldStack>
            {f.text('name', 'Name', { required: true, error: errors.name })}
            {f.text('hsCode', 'HS heading', { placeholder: 'e.g. 7318', hint: 'AHTN / Harmonized System heading.' })}
            {f.num('duty', 'Duty', { suffix: '%', error: errors.duty, hint: 'Confirm against the current Customs tariff.' })}
            {f.check('active', 'Active')}
          </FieldStack>
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
          <FieldStack>
            {f.text('name', 'Name', { required: true, error: errors.name })}
            {f.num('pct', 'Commission', { suffix: '%', error: errors.pct })}
            {f.check('active', 'Active')}
          </FieldStack>
        );
      }}
    />
  );
}

export const ShippingTypesTab = (route: ListRoute) => <MasterDefList def={shippingTypeDef} {...route} />;

export const WarrantyTemplatesTab = (route: ListRoute) => <MasterDefList def={warrantyTemplateDef} {...route} />;

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
          <FieldStack>
            {f.num('number', 'Property no.', { error: errors.number, hint: `1–${MAX_ITEM_PROPERTIES}` })}
            {f.text('name', 'Name', { required: true, error: errors.name })}
            {f.text('group', 'Property group', {
              placeholder: groups.join(', ') || 'e.g. Compliance',
              hint: 'Type an existing group or a new one.',
            })}
            {f.check('active', 'Active')}
          </FieldStack>
        );
      }}
    />
  );
}
