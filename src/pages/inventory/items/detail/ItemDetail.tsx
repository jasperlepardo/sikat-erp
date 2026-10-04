import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Combobox,
  Form,
  FormField,
  IconButton,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  TextField,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { accountProblem } from '../../../../mocks/chartOfAccounts';
import { ITEM_TYPES, MANAGE_BY } from '../../../../mocks/itemMasters';
import {
  blankItem,
  itemUnits,
  withInventoryUom,
  type ItemManufacturer,
  type ItemType,
  type ItemVendor,
  type ItemWarehouse,
} from '../../../../mocks/items';
import {
  EMPTY_INVENTORY_MASTERS,
  activeOptions,
  loadInventoryMasters,
  manufacturers,
  shippingTypes,
  unitsOfMeasure,
  uomGroups,
  warrantyTemplates,
  type InventoryMasters,
} from '../../../../services/inventoryMasters';
import type { Partner } from '../../../../mocks/partners';
import { ItemSaveError, getItem, isValidToday, listItems, saveItem } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { exciseCategories, taxCodes, taxGroups, withholdingGroups } from '../../../../services/masterData';
import { AttachmentsTab } from './AttachmentsTab';
import { BarcodesTab } from './BarcodesTab';
import { GeneralTab } from './GeneralTab';
import { InventoryTab } from './InventoryTab';
import { ManufacturerPanel, ManufacturersCards } from './ManufacturersSection';
import { PlanningTab } from './PlanningTab';
import { ProductionTab } from './ProductionTab';
import { PropertiesTab } from './PropertiesTab';
import { PurchasingTab } from './PurchasingTab';
import { RemarksTab } from './RemarksTab';
import { SalesTab } from './SalesTab';
import { TransactionsTab } from './TransactionsTab';
import { UomGroupPanel, UomsTab, uomErrorKey } from './UomsTab';
import { VendorPanel, VendorsCards } from './VendorsSection';
import { WarehousePanel, WarehousesCards, binErrorKey } from './WarehousesSection';
import { uomDef } from '../../../settings/masterDefs';
import { LOCKED_HINT, asOptions, type Draft, type TaxMasters } from './types';

const LIST_PATH = '/inventory/items';

const TABS = [
  { value: 'general', label: 'General', Component: GeneralTab },
  { value: 'uoms', label: 'Units of measure', Component: UomsTab },
  { value: 'purchasing', label: 'Purchasing', Component: PurchasingTab },
  { value: 'sales', label: 'Sales data', Component: SalesTab },
  { value: 'inventory', label: 'Inventory data', Component: InventoryTab },
  { value: 'planning', label: 'Planning data', Component: PlanningTab },
  { value: 'production', label: 'Production data', Component: ProductionTab },
  { value: 'properties', label: 'Properties', Component: PropertiesTab },
  { value: 'remarks', label: 'Remarks', Component: RemarksTab },
  { value: 'attachments', label: 'Attachments', Component: AttachmentsTab },
  { value: 'barcodes', label: 'Barcodes', Component: BarcodesTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

/** Top-level views in the panel header. Activity is a placeholder for now. */
const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];
/** Warehouse problems point at the side column ('warehouses'), which opens the warehouse's panel. */
type ProblemTab = TabId | 'warehouses';

/** Mandatory and conditional fields from the Item Master Data field map, checked on Add/Save. */
function validate(d: Draft, codeMode: 'auto' | 'manual', inv: InventoryMasters): Problem<ProblemTab>[] {
  const { problems, need } = problemCollector<ProblemTab>();

  need(codeMode === 'auto' || d.itemNo.trim(), 'header', 'itemNo', 'Enter an Item No., or switch numbering to Auto.');
  need(d.description.trim(), 'header', 'description', 'Description is required.');
  need(d.itemGroup, 'header', 'itemGroup', 'Item group is required.');
  need(d.inventoryUom, 'header', 'inventoryUom', 'Inventory UoM is required.');
  const seenUoms = new Set<string>();
  for (const u of d.uoms) {
    need(u.uom, 'uoms', uomErrorKey(u, 'uom'), 'Pick a unit.');
    need(!u.uom || !seenUoms.has(u.uom), 'uoms', uomErrorKey(u, 'uom'), `${u.uom} is listed twice.`);
    seenUoms.add(u.uom);
    need(u.qty > 0, 'uoms', uomErrorKey(u, 'qty'), 'Enter more than 0.');
    need(u.price >= 0, 'uoms', uomErrorKey(u, 'price'), 'Price can’t be negative.');
  }
  // Default units must be among the item's units and allowed on their documents; barcodes too.
  const usable = (use: 'purchase' | 'sales') => itemUnits(d, use).map((u) => u.uom);
  const notUsable = (uom: string, use: 'purchase' | 'sales', doc: string) =>
    `${uom} isn’t one of the item’s units for ${doc} — pick one of ${usable(use).join(', ') || 'its units'}, or tick it on the unit.`;
  need(!d.purchaseItem || usable('purchase').includes(d.purchasingUom), 'purchasing', 'purchasingUom', notUsable(d.purchasingUom, 'purchase', 'purchasing'));
  need(!d.salesItem || usable('sales').includes(d.salesUom), 'sales', 'salesUom', notUsable(d.salesUom, 'sales', 'sales'));
  for (const b of d.barcodes) {
    need(!b.uom || d.uoms.some((u) => u.uom === b.uom), 'barcodes', `barcode:${b.id}:uom`, `${b.uom} isn’t one of the item’s units.`);
  }

  need(d.purchaseItem || d.salesItem || d.inventoryItem, 'general', 'usage', 'Tick at least one of purchase, sales or inventory item.');
  need(!d.validFrom || !d.validTo || d.validFrom <= d.validTo, 'general', 'validTo', 'Valid to is before Valid from.');
  need(!d.exciseTax || d.exciseCategory, 'general', 'exciseCategory', 'Pick the excise category.');
  if (d.glBy === 'Item Level') {
    for (const [key, role, required] of [
      ['inventoryAccount', 'inventory', d.inventoryItem],
      ['cogsAccount', 'cogs', true],
      ['revenueAccount', 'revenue', d.salesItem],
    ] as const) {
      const problem = accountProblem(d[key], role, inv.accounts, required);
      need(!problem, 'general', key, problem ?? '');
    }
  }
  need(!d.purchaseItem || d.purchaseTaxGroup, 'purchasing', 'purchaseTaxGroup', 'Purchase items need a tax group.');
  need(!d.salesItem || d.salesTaxGroup, 'sales', 'salesTaxGroup', 'Sales items need a tax group.');

  if (d.inventoryItem) {
    need(!d.maxStock || d.maxStock >= d.minStock, 'inventory', 'maxStock', 'Maximum stock is below minimum stock.');
    for (const w of d.warehouses) {
      const wh = inv.warehouses.find((x) => x.code === w.code);
      need(!wh?.binEnabled || w.defaultBin, 'warehouses', binErrorKey(w.code), `${w.code} uses bins — pick a default bin.`);
    }
  }

  const seen = new Set<string>();
  for (const b of d.barcodes) {
    need(b.barcode, 'barcodes', `barcode:${b.id}:barcode`, 'Every barcode row needs a barcode.');
    need(b.uom, 'barcodes', `barcode:${b.id}:uom`, 'Every barcode row needs a UoM.');
    if (b.barcode) {
      need(!seen.has(b.barcode), 'barcodes', `barcode:${b.id}:barcode`, `Barcode ${b.barcode} is listed twice.`);
      seen.add(b.barcode);
    }
  }
  return problems;
}

/** Keyed by record so moving between items (or duplicating into /new) starts a fresh form. */
export function ItemDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ItemForm key={id === 'new' ? location.key : id} />;
}

function ItemForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: Draft } | null)?.copyFrom;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? (copyFrom ?? blankItem()) : undefined);
  const [vendors, setVendors] = useState<Partner[]>([]);
  const [tax, setTax] = useState<TaxMasters>({ groups: [], codes: [], excise: [], withholdingGroups: [] });
  const [inv, setInv] = useState<InventoryMasters>(EMPTY_INVENTORY_MASTERS);
  // Validation and pickers depend on master data, so the form waits for it.
  const [mastersReady, setMastersReady] = useState(false);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('general');
  const [page, setPage] = useState<PageId>('details');
  // Items in the list's order, for previous/next.
  const [siblings, setSiblings] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew) listItems().then((all) => setSiblings(all.map((i) => i.id)));
  }, [isNew]);
  const [problems, setProblems] = useState<Problem<ProblemTab>[]>([]);
  const [editingWarehouse, setEditingWarehouse] = useState<{ value: ItemWarehouse; isNew: boolean } | null>(null);
  const [editingManufacturer, setEditingManufacturer] = useState<{ value: ItemManufacturer; isNew: boolean } | null>(null);
  const [addingFromGroup, setAddingFromGroup] = useState(false);
  // Units saved on the item when it was opened: with transactions, their factors lock.
  const [savedUomIds, setSavedUomIds] = useState<Set<string>>(new Set());
  const [editingVendor, setEditingVendor] = useState<{ value: ItemVendor; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPartnersByRole('vendor').then(setVendors);
    Promise.all([loadInventoryMasters(), taxGroups.list(), taxCodes.list(), exciseCategories.list(), withholdingGroups.list()]).then(
      ([inventory, groups, codes, excise, wGroups]) => {
        setInv(inventory);
        setTax({ groups, codes, excise, withholdingGroups: wGroups });
        setMastersReady(true);
      },
    );
    // Entries added from a field's "+ Add" (or in Settings meanwhile) reach the rest of the form.
    const reload = () => loadInventoryMasters().then(setInv);
    const offs = [unitsOfMeasure, uomGroups, manufacturers, shippingTypes, warrantyTemplates].map((c) => c.subscribe(reload));
    if (isNew || !id) return () => offs.forEach((off) => off());
    let cancelled = false;
    getItem(id).then((item) => {
      if (cancelled) return;
      setDraft(item ?? null);
      setSavedUomIds(new Set(item?.uoms.map((u) => u.id)));
    });
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, [id, isNew]);

  if (draft === undefined || !mastersReady) return <Text tone="muted" className="p-4">Loading item…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inventory_2" title="Item not found" />
        <Panel.Body>
          <Button onClick={() => navigate(LIST_PATH)}>Back to items</Button>
        </Panel.Body>
      </Panel>
    );
  }

  // A new inventory UoM replaces the old one among the item's units.
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    const { inventoryUom } = patch;
    setDraft(inventoryUom !== undefined && inventoryUom !== draft.inventoryUom ? withInventoryUom({ ...next, inventoryUom: draft.inventoryUom }, inventoryUom) : next);
  };
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const h = bind(draft, update);
  // Side-column fields: label beside the control.
  const beside = { orientation: 'vertical' as const };
  const locked = draft.hasTransactions;
  const group = inv.groups.find((g) => g.name === draft.itemGroup);

  // Group change: re-default valuation (unless locked), the group's G/L accounts and the tax defaults it sets.
  const changeGroup = (name: string) => {
    const g = inv.groups.find((x) => x.name === name)!;
    update({
      itemGroup: name,
      ...(locked && draft.inventoryItem ? {} : { valuationMethod: g.valuationMethod }),
      ...(draft.glBy === 'Item Level'
        ? {}
        : { inventoryAccount: g.inventoryAccount, cogsAccount: g.cogsAccount, revenueAccount: g.revenueAccount }),
      ...(g.purchaseTaxGroup ? { purchaseTaxGroup: g.purchaseTaxGroup } : {}),
      ...(g.salesTaxGroup ? { salesTaxGroup: g.salesTaxGroup } : {}),
      ...(g.withholdingGroup ? { withholdingGroup: g.withholdingGroup } : {}),
      ...(g.exciseCategory ? { exciseTax: true, exciseCategory: g.exciseCategory } : {}),
    });
  };
  const lockedUomIds = locked ? savedUomIds : new Set<string>();

  // Labor and Travel are never stocked or tracked.
  const changeType = (itemType: ItemType) =>
    update(itemType === 'Items' ? { itemType } : { itemType, inventoryItem: false, manageBy: 'None', warehouses: [] });

  /** Show where a problem is: a tab, or the panel of the warehouse it's about. */
  const openProblem = (t: ProblemTab | 'header', found = problems) => {
    if (t === 'header') return;
    if (t !== 'warehouses') return setTab(t);
    const code = found.find((p) => p.tab === 'warehouses')?.key.split(':')[1];
    const row = draft.warehouses.find((w) => w.code === code);
    if (row) setEditingWarehouse({ value: row, isNew: false });
  };
  const applyWarehouse = (row: ItemWarehouse, added: boolean) => {
    update({ warehouses: added ? [...draft.warehouses, row] : draft.warehouses.map((w) => (w.code === row.code ? row : w)) });
    setProblems(problems.filter((p) => p.key !== binErrorKey(row.code)));
    setEditingWarehouse(null);
  };

  // `main` makes this row the main manufacturer; unticking the current main clears it.
  const applyManufacturer = (row: ItemManufacturer, added: boolean, main: boolean) => {
    const was = added ? undefined : draft.manufacturers.find((m) => m.id === row.id)?.code;
    update({
      manufacturers: added ? [...draft.manufacturers, row] : draft.manufacturers.map((m) => (m.id === row.id ? row : m)),
      manufacturer: main ? row.code : draft.manufacturer === was ? '' : draft.manufacturer,
    });
    setEditingManufacturer(null);
  };

  // `main` makes this row the default vendor; unticking the current default clears it.
  const applyVendor = (row: ItemVendor, added: boolean, main: boolean) => {
    const was = added ? undefined : draft.vendors.find((v) => v.id === row.id)?.vendorId;
    update({
      vendors: added ? [...draft.vendors, row] : draft.vendors.map((v) => (v.id === row.id ? row : v)),
      defaultVendorId: main ? row.vendorId : draft.defaultVendorId === was ? '' : draft.defaultVendorId,
    });
    setEditingVendor(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft, isNew ? codeMode : 'manual', inv);
    setProblems(found);
    const first = found[0];
    if (first) openProblem(first.tab, found);
    if (found.length) return;
    setSaving(true);
    try {
      await saveItem({ ...draft, itemNo: isNew && codeMode === 'auto' ? '' : draft.itemNo });
      navigate(LIST_PATH);
    } catch (err) {
      if (!(err instanceof ItemSaveError)) throw err;
      setProblems([{ tab: err.field === 'itemNo' ? 'header' : 'barcodes', key: err.field, message: err.message }]);
      if (err.field === 'barcodes') setTab('barcodes');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    // A copy is a new item: no number, no stock or history, and barcodes must stay unique.
    const copy: Draft = {
      ...structuredClone(draft),
      id: undefined,
      itemNo: '',
      description: `${draft.description} (copy)`,
      hasTransactions: false,
      barcodes: [],
      gtin: '',
      attachments: [],
      warehouses: draft.warehouses.map((w) => ({ ...w, inStock: 0, committed: 0, ordered: 0 })),
    };
    navigate(`${LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const vendor = vendors.find((v) => v.id === draft.defaultVendorId);
  const menu: MoreMenuItem[] = isNew
    ? []
    : [
        { label: 'Duplicate', icon: 'content_copy', onSelect: duplicate },
        ...(vendor
          ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }]
          : []),
      ];

  const counts: Partial<Record<TabId, number>> = {
    attachments: draft.attachments.length,
    barcodes: draft.barcodes.length,
    uoms: draft.uoms.length,
  };
  const ActiveTab = TABS.find((t) => t.value === tab)!.Component;
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;

  return (
    <>
      <Form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
        <Panel className="min-h-0 flex-1">
          <PanelHeader
            type="details"
            icon="inventory_2"
            title={isNew ? 'New item' : draft.description}
            subcopy={isNew ? 'Add a product, material or service to the item master.' : draft.itemNo}
            // A saved record leads with previous/next (through the list it was opened from); a new one with the icon.
            leading={
              isNew ? undefined : (
                <>
                  <IconButton
                    type="button"
                    label="Next"
                    intent="default"
                    variant="solid"
                    size="extra-large"
                    disabled={!nextId}
                    onClick={() => navigate(`${LIST_PATH}/${nextId}`)}
                  >
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                  <IconButton
                    type="button"
                    label="Previous"
                    intent="default"
                    variant="solid"
                    size="extra-large"
                    disabled={!prevId}
                    onClick={() => navigate(`${LIST_PATH}/${prevId}`)}
                  >
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                </>
              )
            }
            tabs={
              <Tabs
                variant="outline"
                value={page}
                onValueChange={(v) => setPage(v as PageId)}
                // An item has no transactions or activity until it's added.
                items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))}
              />
            }
            status={
              isNew ? undefined : (
                <div className="flex gap-1">
                  <Badge intent="primary">{draft.itemType}</Badge>
                  {!isValidToday(draft) ? <Badge intent="danger">Not valid today</Badge> : null}
                  {locked ? <Badge variant="outline">Has transactions</Badge> : null}
                </div>
              )
            }
            actions={
              <>
                <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(LIST_PATH)}>
                  Cancel
                </Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                  {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
                </Button>
              </>
            }
          />
          {page !== 'details' ? (
            <Panel.Body>
              {page === 'transactions' ? (
                <TransactionsTab draft={draft} />
              ) : (
                <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
              )}
            </Panel.Body>
          ) : (
            /* Side by side (lg), each column scrolls on its own; stacked, the body scrolls as one. */
            <Panel.Body className="flex flex-col gap-2 lg:overflow-hidden!">
              <ProblemsAlert
                problems={problems}
                tabLabel={(t) => (t === 'warehouses' ? 'Warehouses' : TABS.find((x) => x.value === t)?.label)}
                onOpenTab={(t) => openProblem(t)}
              />

              <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-1">
                <aside className="flex flex-col gap-2 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto">
                  <Section icon="inventory_2" title="Item">
                    <FieldStack>
                      {isNew ? (
                        <FormField orientation="responsive" label="Numbering" tooltip={`Auto uses the group series, e.g. ${group?.prefix ?? 'ITM'}-00001.`}>
                          {(p) => (
                            <Select
                              {...p}
                              options={[
                                { value: 'auto', label: `Auto (${group?.prefix ?? 'ITM'}-#####)` },
                                { value: 'manual', label: 'Manual' },
                              ]}
                              value={codeMode}
                              onValueChange={(v) => setCodeMode(v as 'auto' | 'manual')}
                            />
                          )}
                        </FormField>
                      ) : null}
                      <FormField
                        orientation="responsive"
                        label="Item No."
                        required
                        error={errors.itemNo}
                        tooltip={isNew ? 'Prefix by group, e.g. IPH- iPhone, ACC- accessories.' : locked ? LOCKED_HINT : undefined}
                      >
                        {(p) => (
                          <TextField
                            {...p}
                            value={isNew && codeMode === 'auto' ? '' : draft.itemNo}
                            placeholder={isNew && codeMode === 'auto' ? 'Assigned on save' : 'e.g. IPH-18P-256-BLK'}
                            readOnly={(isNew && codeMode === 'auto') || locked}
                            onChange={(e) => update({ itemNo: e.currentTarget.value })}
                          />
                        )}
                      </FormField>
                      <FormField orientation="responsive" label="Item type" required tooltip={locked ? LOCKED_HINT : 'Labor and Travel are never stocked.'}>
                        {(p) => (
                          <Select
                            {...p}
                            options={asOptions(ITEM_TYPES)}
                            disabled={locked}
                            value={draft.itemType}
                            onValueChange={(v) => changeType(v as ItemType)}
                          />
                        )}
                      </FormField>
                      {h.text('description', 'Description', {
                        ...beside,
                        required: true,
                        error: errors.description,
                        hint: 'Printed on every document.',
                      })}
                      {h.text('foreignName', 'Foreign name', { ...beside, hint: 'Second-language name or alias.' })}
                      <FormField
                        orientation="responsive"
                        label="Item group"
                        required
                        error={errors.itemGroup}
                        tooltip={locked ? 'Changing it after postings can misalign G/L — check with Finance.' : 'Sets valuation and G/L defaults.'}
                      >
                        {(p) => (
                          <Combobox
                            {...p}
                            options={activeOptions(inv.groups, (g) => g.name, (g) => `${g.name} (${g.prefix})`, draft.itemGroup)}
                            value={draft.itemGroup}
                            onValueChange={(v) => changeGroup(v ?? '')}
                          />
                        )}
                      </FormField>
                      {h.master('inventoryUom', 'Inventory UoM', uomDef, {
                        ...beside,
                        required: true,
                        error: errors.inventoryUom,
                        disabled: locked,
                        hint: locked ? LOCKED_HINT : 'Stock balances are kept in this unit. Other units convert to it.',
                      })}
                      {h.choose('manageBy', 'Manage item by', asOptions(MANAGE_BY), {
                        ...beside,
                        required: true,
                        disabled: locked || draft.itemType !== 'Items',
                        hint: locked ? LOCKED_HINT : 'Batches for lots/expiry; serial numbers for each unit.',
                      })}
                    </FieldStack>
                  </Section>
                  <WarehousesCards
                    draft={draft}
                    update={update}
                    inv={inv}
                    vendors={vendors}
                    errors={errors}
                    onOpen={(value, added) => setEditingWarehouse({ value, isNew: added })}
                  />
                  <VendorsCards
                    draft={draft}
                    update={update}
                    vendors={vendors}
                    onOpen={(value, added) => setEditingVendor({ value, isNew: added })}
                  />
                  <ManufacturersCards
                    draft={draft}
                    update={update}
                    inv={inv}
                    onOpen={(value, added) => setEditingManufacturer({ value, isNew: added })}
                  />
                </aside>

                <div className="flex min-w-0 flex-col gap-2 lg:col-span-9 lg:min-h-0 lg:overflow-y-auto">
                  <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as TabId)}
                    items={TABS.map((t) => ({
                      value: t.value,
                      label: t.label,
                      badge: problems.some((p) => p.tab === t.value) ? '!' : counts[t.value] ? String(counts[t.value]) : undefined,
                    }))}
                  />
                  <ActiveTab
                    draft={draft}
                    update={(patch) => {
                      // Linked defaults: customs group → duty %, commission group → commission %.
                      const customs = inv.customs.find((c) => c.id === patch.customsGroup);
                      const commission = inv.commissions.find((c) => c.id === patch.commissionGroup);
                      update({
                        ...patch,
                        ...(customs ? { dutyPct: customs.duty } : {}),
                        ...(commission ? { commissionPct: commission.pct } : {}),
                      });
                    }}
                    errors={errors}
                    vendors={vendors}
                    inv={inv}
                    tax={tax}
                    lockedUomIds={lockedUomIds}
                    onAddUomsFromGroup={() => setAddingFromGroup(true)}
                  />
                </div>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>

      {/* Outside the <Form>, so Enter in a panel field doesn't save the item. */}
      {editingWarehouse ? (
        <WarehousePanel
          key={editingWarehouse.value.code || 'new'}
          value={editingWarehouse.value}
          isNew={editingWarehouse.isNew}
          draft={draft}
          inv={inv}
          vendors={vendors}
          onDone={(row) => applyWarehouse(row, editingWarehouse.isNew)}
          onCancel={() => setEditingWarehouse(null)}
        />
      ) : addingFromGroup ? (
        <UomGroupPanel
          draft={draft}
          inv={inv}
          onDone={(rows) => {
            update({ uoms: [...draft.uoms, ...rows] });
            setAddingFromGroup(false);
          }}
          onCancel={() => setAddingFromGroup(false)}
        />
      ) : editingVendor ? (
        <VendorPanel
          key={editingVendor.value.id}
          value={editingVendor.value}
          isNew={editingVendor.isNew}
          draft={draft}
          vendors={vendors}
          onDone={(row, main) => applyVendor(row, editingVendor.isNew, main)}
          onCancel={() => setEditingVendor(null)}
        />
      ) : editingManufacturer ? (
        <ManufacturerPanel
          key={editingManufacturer.value.id}
          value={editingManufacturer.value}
          isNew={editingManufacturer.isNew}
          draft={draft}
          onDone={(row, main) => applyManufacturer(row, editingManufacturer.isNew, main)}
          onCancel={() => setEditingManufacturer(null)}
        />
      ) : null}
    </>
  );
}
