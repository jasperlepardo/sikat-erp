import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Badge, Button, Form, FormField, Panel, PanelHeader, Select, Tabs, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { accountProblem } from '../../../../mocks/chartOfAccounts';
import { ITEM_TYPES, MANAGE_BY } from '../../../../mocks/itemMasters';
import { blankItem, newManufacturerRow, type ItemType } from '../../../../mocks/items';
import {
  EMPTY_INVENTORY_MASTERS,
  activeOptions,
  loadInventoryMasters,
  type InventoryMasters,
} from '../../../../services/inventoryMasters';
import type { Partner } from '../../../../mocks/partners';
import { ItemSaveError, getItem, isValidToday, saveItem } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { exciseCategories, taxCodes, taxGroups } from '../../../../services/masterData';
import { AttachmentsTab } from './AttachmentsTab';
import { BarcodesTab } from './BarcodesTab';
import { GeneralTab } from './GeneralTab';
import { InventoryTab } from './InventoryTab';
import { ManufacturersTab } from './ManufacturersTab';
import { PlanningTab } from './PlanningTab';
import { ProductionTab } from './ProductionTab';
import { PropertiesTab } from './PropertiesTab';
import { PurchasingTab } from './PurchasingTab';
import { RemarksTab } from './RemarksTab';
import { SalesTab } from './SalesTab';
import { LOCKED_HINT, asOptions, type Draft, type TaxMasters } from './types';

const LIST_PATH = '/inventory/items';

const TABS = [
  { value: 'general', label: 'General', Component: GeneralTab },
  { value: 'purchasing', label: 'Purchasing', Component: PurchasingTab },
  { value: 'sales', label: 'Sales', Component: SalesTab },
  { value: 'inventory', label: 'Inventory', Component: InventoryTab },
  { value: 'planning', label: 'Planning', Component: PlanningTab },
  { value: 'production', label: 'Production', Component: ProductionTab },
  { value: 'properties', label: 'Properties', Component: PropertiesTab },
  { value: 'remarks', label: 'Remarks', Component: RemarksTab },
  { value: 'attachments', label: 'Attachments', Component: AttachmentsTab },
  { value: 'manufacturers', label: 'Manufacturers', Component: ManufacturersTab },
  { value: 'barcodes', label: 'Barcodes', Component: BarcodesTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

/** Mandatory and conditional fields from the Item Master Data field map, checked on Add/Save. */
function validate(d: Draft, codeMode: 'auto' | 'manual', inv: InventoryMasters): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();

  need(codeMode === 'auto' || d.itemNo.trim(), 'header', 'itemNo', 'Enter an Item No., or switch numbering to Auto.');
  need(d.description.trim(), 'header', 'description', 'Description is required.');
  need(d.itemGroup, 'header', 'itemGroup', 'Item group is required.');
  need(d.inventoryUom, 'header', 'inventoryUom', 'Inventory UoM is required.');

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

  if (d.purchaseItem && d.purchasingUom !== d.inventoryUom) {
    need(d.itemsPerPurchaseUnit > 0, 'purchasing', 'itemsPerPurchaseUnit', `Enter how many ${d.inventoryUom} are in one ${d.purchasingUom}.`);
  }
  if (d.salesItem && d.salesUom !== d.inventoryUom) {
    need(d.itemsPerSalesUnit > 0, 'sales', 'itemsPerSalesUnit', `Enter how many ${d.inventoryUom} are in one ${d.salesUom}.`);
  }

  if (d.inventoryItem) {
    need(!d.maxStock || d.maxStock >= d.minStock, 'inventory', 'maxStock', 'Maximum stock is below minimum stock.');
    for (const w of d.warehouses) {
      const wh = inv.warehouses.find((x) => x.code === w.code);
      need(!wh?.binEnabled || w.defaultBin, 'inventory', `wh:${w.code}:bin`, `${w.code} uses bins — pick a default bin.`);
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
  const [tax, setTax] = useState<TaxMasters>({ groups: [], codes: [], excise: [] });
  const [inv, setInv] = useState<InventoryMasters>(EMPTY_INVENTORY_MASTERS);
  // Validation and pickers depend on master data, so the form waits for it.
  const [mastersReady, setMastersReady] = useState(false);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('general');
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPartnersByRole('vendor').then(setVendors);
    Promise.all([loadInventoryMasters(), taxGroups.list(), taxCodes.list(), exciseCategories.list()]).then(
      ([inventory, groups, codes, excise]) => {
        setInv(inventory);
        setTax({ groups, codes, excise });
        setMastersReady(true);
      },
    );
    if (isNew || !id) return;
    let cancelled = false;
    getItem(id).then((item) => !cancelled && setDraft(item ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined || !mastersReady) return <p className="p-4 text-muted">Loading item…</p>;
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

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const h = bind(draft, update);
  const locked = draft.hasTransactions;
  const group = inv.groups.find((g) => g.name === draft.itemGroup);

  // Group change: re-default valuation (unless locked) and the group's G/L accounts.
  const changeGroup = (name: string) => {
    const g = inv.groups.find((x) => x.name === name)!;
    update({
      itemGroup: name,
      ...(locked && draft.inventoryItem ? {} : { valuationMethod: g.valuationMethod }),
      ...(draft.glBy === 'Item Level'
        ? {}
        : { inventoryAccount: g.inventoryAccount, cogsAccount: g.cogsAccount, revenueAccount: g.revenueAccount }),
    });
  };
  // Labor and Travel are never stocked or tracked.
  const changeType = (itemType: ItemType) =>
    update(itemType === 'Items' ? { itemType } : { itemType, inventoryItem: false, manageBy: 'None', warehouses: [] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft, isNew ? codeMode : 'manual', inv);
    setProblems(found);
    const first = found[0];
    if (first && first.tab !== 'header') setTab(first.tab);
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
    inventory: draft.warehouses.length,
    attachments: draft.attachments.length,
    manufacturers: draft.manufacturers.length,
    barcodes: draft.barcodes.length,
  };
  const ActiveTab = TABS.find((t) => t.value === tab)!.Component;

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="forms"
          icon="inventory_2"
          title={isNew ? 'New item' : draft.description}
          subcopy={isNew ? 'Add a product, material or service to the item master.' : draft.itemNo}
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
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TABS.find((x) => x.value === t)?.label} onOpenTab={setTab} />

          <Section icon="inventory_2" title="Item">
            <Fields cols={3}>
              {isNew ? (
                <FormField label="Numbering" hint={`Auto uses the group series, e.g. ${group?.prefix ?? 'ITM'}-00001.`}>
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
                label="Item No."
                required
                error={errors.itemNo}
                hint={isNew ? 'Prefix by group, e.g. IPH- iPhone, ACC- accessories.' : locked ? LOCKED_HINT : undefined}
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
              <FormField label="Item type" required hint={locked ? LOCKED_HINT : 'Labor and Travel are never stocked.'}>
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
                required: true,
                error: errors.description,
                hint: 'Printed on every document.',
              })}
              {h.text('foreignName', 'Foreign name', { hint: 'Second-language name or alias.' })}
              <FormField
                label="Item group"
                required
                error={errors.itemGroup}
                hint={locked ? 'Changing it after postings can misalign G/L — check with Finance.' : 'Sets valuation and G/L defaults.'}
              >
                {(p) => (
                  <Select
                    {...p}
                    options={activeOptions(inv.groups, (g) => g.name, (g) => `${g.name} (${g.prefix})`, draft.itemGroup)}
                    value={draft.itemGroup}
                    onValueChange={changeGroup}
                  />
                )}
              </FormField>
              {h.choose('inventoryUom', 'Inventory UoM', activeOptions(inv.uoms, (u) => u.code, (u) => `${u.code} · ${u.name}`, draft.inventoryUom), {
                required: true,
                error: errors.inventoryUom,
                disabled: locked,
                hint: locked ? LOCKED_HINT : 'Stock balances are kept in this unit.',
              })}
              {h.choose('manageBy', 'Manage item by', asOptions(MANAGE_BY), {
                required: true,
                disabled: locked || draft.itemType !== 'Items',
                hint: locked ? LOCKED_HINT : 'Batches for lots/expiry; serial numbers for each unit.',
              })}
            </Fields>
          </Section>

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
              // Linked defaults: customs group → duty %, commission group → commission %,
              // and the Purchasing manufacturer is always a row on the Manufacturers tab.
              const customs = inv.customs.find((c) => c.id === patch.customsGroup);
              const commission = inv.commissions.find((c) => c.id === patch.commissionGroup);
              const addManufacturer =
                patch.manufacturer && !draft.manufacturers.some((m) => m.code === patch.manufacturer)
                  ? { manufacturers: [...draft.manufacturers, newManufacturerRow(patch.manufacturer)] }
                  : {};
              update({
                ...patch,
                ...(customs ? { dutyPct: customs.duty } : {}),
                ...(commission ? { commissionPct: commission.pct } : {}),
                ...addManufacturer,
              });
            }}
            errors={errors}
            vendors={vendors}
            inv={inv}
            tax={tax}
          />
        </Panel.Body>
      </Panel>
    </Form>
  );
}
