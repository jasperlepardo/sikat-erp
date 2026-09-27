import React, { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge, Button, Form, FormField, Icon, IconButton,
  Panel, PanelHeader, Select, SidePanel, Tabs, TextField,
  type TabItem,
} from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../components/form/fields';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ITEM_TYPES, MANAGE_BY } from '../../../mocks/itemMasters';
import { blankItem, newManufacturerRow, type ItemType } from '../../../mocks/items';
import {
  EMPTY_INVENTORY_MASTERS,
  activeOptions,
  loadInventoryMasters,
  type InventoryMasters,
} from '../../../services/inventoryMasters';
import type { Partner } from '../../../mocks/partners';
import { ItemSaveError, getItem, isValidToday, saveItem } from '../../../services/items';
import { listPartnersByRole } from '../../../services/partners';
import { exciseCategories, taxCodes, taxGroups } from '../../../services/masterData';
import { AttachmentsTab } from '../items/detail/AttachmentsTab';
import { BarcodesTab } from '../items/detail/BarcodesTab';
import { ConfigureTab, type ConfigurePanelTab } from '../items/detail/ConfigureTab';
import { InventoryTab } from '../items/detail/InventoryTab';
import { ManufacturersTab } from '../items/detail/ManufacturersTab';
import { PlanningTab } from '../items/detail/PlanningTab';
import { RemarksTab } from '../items/detail/RemarksTab';
import { LOCKED_HINT, asOptions, taxGroupOptions, vendorOptions, type Draft, type TaxMasters } from '../items/detail/types';

const BASE = '/inventory/items-new';

const TABS = [
  { value: 'inventory', label: 'Inventory', Component: InventoryTab },
  { value: 'planning', label: 'Planning', Component: PlanningTab },
  { value: 'remarks', label: 'Remarks', Component: RemarksTab },
  { value: 'attachments', label: 'Attachments', Component: AttachmentsTab },
  { value: 'manufacturers', label: 'Manufacturers', Component: ManufacturersTab },
  { value: 'barcodes', label: 'Barcodes', Component: BarcodesTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

function validate(d: Draft, codeMode: 'auto' | 'manual'): Problem<TabId | 'header'>[] {
  const { problems, need } = problemCollector<TabId | 'header'>();
  need(codeMode === 'auto' || d.itemNo.trim(), 'header', 'itemNo', 'Enter an Item No., or switch numbering to Auto.');
  need(d.description.trim(), 'header', 'description', 'Description is required.');
  need(d.itemGroup, 'header', 'itemGroup', 'Item group is required.');
  need(d.inventoryUom, 'header', 'inventoryUom', 'Inventory UoM is required.');
  need(d.purchaseItem || d.salesItem || d.inventoryItem, 'header', 'usage', 'At least one of purchase, sales or inventory must be ticked — check Configure.');
  need(!d.validFrom || !d.validTo || d.validFrom <= d.validTo, 'header', 'validTo', 'Valid to is before Valid from.');
  if (d.inventoryItem) {
    need(!d.maxStock || d.maxStock >= d.minStock, 'inventory', 'maxStock', 'Maximum stock is below minimum stock.');
  }
  return problems;
}

export function ItemDetailNew() {
  const { id } = useParams();
  const location = useLocation();
  return <ItemFormNew key={id === 'new' ? location.key : id} />;
}

function ItemFormNew() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: Draft } | null)?.copyFrom;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? (copyFrom ?? blankItem()) : undefined);
  const [vendors, setVendors] = useState<Partner[]>([]);
  const [tax, setTax] = useState<TaxMasters>({ groups: [], codes: [], excise: [] });
  const [inv, setInv] = useState<InventoryMasters>(EMPTY_INVENTORY_MASTERS);
  const [mastersReady, setMastersReady] = useState(false);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('inventory');
  const [problems, setProblems] = useState<Problem<TabId | 'header'>[]>([]);
  const [saving, setSaving] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [configureTab, setConfigureTab] = useState<ConfigurePanelTab>('accounting');

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
    return () => { cancelled = true; };
  }, [id, isNew]);

  // Close panel on Escape
  useEffect(() => {
    if (!configureOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfigureOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [configureOpen]);

  if (draft === undefined || !mastersReady) return <p className="p-4 text-muted">Loading item…</p>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inventory_2" title="Item not found" />
        <Panel.Body>
          <Button onClick={() => navigate(BASE)}>Back to items</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((prev) => prev ? { ...prev, ...patch } : prev);
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const h = bind(draft, update);
  const locked = draft.hasTransactions;
  const group = inv.groups.find((g) => g.name === draft.itemGroup);

  // Linked-defaults update shared by both main tabs and configure panel.
  const updateWithDefaults = (patch: Partial<Draft>) => {
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
  };

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

  const changeType = (itemType: ItemType) =>
    update(itemType === 'Items' ? { itemType } : { itemType, inventoryItem: false, manageBy: 'None', warehouses: [] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft, isNew ? codeMode : 'manual');
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      await saveItem({ ...draft, itemNo: isNew && codeMode === 'auto' ? '' : draft.itemNo });
      navigate(BASE);
    } catch (err) {
      if (!(err instanceof ItemSaveError)) throw err;
      setProblems([{ tab: 'header', key: err.field, message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
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
    navigate(`${BASE}/new`, { state: { copyFrom: copy } });
  };

  const vendor = vendors.find((v) => v.id === draft.defaultVendorId);
  const menu: MoreMenuItem[] = isNew
    ? []
    : [
        { label: 'Duplicate', icon: 'content_copy', onSelect: duplicate },
        { label: 'Open in full view', icon: 'open_in_new', onSelect: () => navigate(`/inventory/items/${id}`) },
        ...(vendor
          ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }]
          : []),
      ];

  const counts: Partial<Record<TabId, number>> = {
    attachments: draft.attachments.length,
    manufacturers: draft.manufacturers.length,
    barcodes: draft.barcodes.length,
    inventory: draft.warehouses.length,
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
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(BASE)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              {!isNew ? (
                <Button
                  type="button"
                  intent="default"
                  variant="outline"
                  size="extra-large"
                  leadingIcon={<Icon size={20}>settings</Icon>}
                  onClick={() => setConfigureOpen(true)}
                >
                  Configure
                </Button>
              ) : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert
            problems={problems}
            tabLabel={(t) => TABS.find((x) => x.value === t)?.label}
            onOpenTab={(t) => { if (TABS.some((x) => x.value === t)) setTab(t as TabId); }}
          />

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
                hint={isNew ? undefined : locked ? LOCKED_HINT : undefined}
              >
                {(p) => (
                  <TextField
                    {...p}
                    value={isNew && codeMode === 'auto' ? '' : draft.itemNo}
                    placeholder={isNew && codeMode === 'auto' ? 'Assigned on save' : 'e.g. FST-BLT-0612'}
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
                hint={locked ? 'Changing after postings can misalign G/L.' : 'Sets valuation and G/L defaults.'}
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

          <Section icon="edit_note" title="Key details">
            <Fields cols={3}>
              {h.num('basePrice', `Base price per ${draft.salesUom}`, {
                prefix: 'PHP',
                hint: 'Default price list. Customer price lists live in Inventory › Pricing.',
              })}
              {h.choose('defaultVendorId', 'Default vendor', vendorOptions(vendors), {
                hint: 'Pre-fills new purchase orders.',
              })}
              {h.choose('salesTaxGroup', 'Sales tax group', taxGroupOptions(tax, 'Sales', draft.salesTaxGroup), {
                hint: 'Tax applied on sales.',
              })}
              {h.choose('purchaseTaxGroup', 'Purchase tax group', taxGroupOptions(tax, 'Purchase', draft.purchaseTaxGroup), {
                hint: 'Tax applied on purchases.',
              })}
              {h.date('validFrom', 'Valid from', { hint: 'Blocks documents dated before this.' })}
              {h.date('validTo', 'Valid to', { error: errors.validTo, hint: 'Phases the item out without deleting it.' })}
              {h.area('generalRemarks', 'Remarks', {
                rows: 2,
                className: 'md:col-span-3',
                hint: 'Shown to everyone who opens the item.',
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
            update={updateWithDefaults}
            errors={errors}
            vendors={vendors}
            inv={inv}
            tax={tax}
          />
        </Panel.Body>
      </Panel>

      {/* ── Configure side panel ── */}
      {configureOpen && (
        <SidePanel
          overlay
          onOverlayClick={() => setConfigureOpen(false)}
          style={{ '--sikat-side-panel-width': '720px' } as React.CSSProperties}
        >
          <PanelHeader
            icon="settings"
            title="Configure"
            actions={
              <>
                <IconButton
                  variant="ghost"
                  label="Close configure panel"
                  onClick={() => setConfigureOpen(false)}
                >
                  close
                </IconButton>
                <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                  {saving ? 'Saving…' : 'Save item'}
                </Button>
              </>
            }
          />
          <Panel.Body>
            <Tabs
              value={configureTab}
              onValueChange={(v) => setConfigureTab(v as ConfigurePanelTab)}
              items={
                [
                  { value: 'accounting', label: 'Accounting' },
                  { value: 'tax', label: 'Tax' },
                  { value: 'purchasing', label: 'Purchasing' },
                  { value: 'sales', label: 'Sales' },
                ] satisfies TabItem[]
              }
            />
            <div key={configureTab}>
              <ConfigureTab
                draft={draft}
                update={updateWithDefaults}
                errors={errors}
                vendors={vendors}
                inv={inv}
                tax={tax}
                activeTab={configureTab}
              />
            </div>
          </Panel.Body>
        </SidePanel>
      )}
    </Form>
  );
}
