import { itemUnits, uomSummary, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Errors } from '../../../../components/form/fields';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { currentRate, type ExciseCategory, type TaxCode, type TaxDirection, type TaxGroup, type WithholdingGroup } from '../../../../mocks/taxes';

export type Draft = Omit<Item, 'id'> & { id?: string };

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  /** Vendors (partners with the vendor role), for default / preferred vendor pickers. */
  vendors: Partner[];
  /** Tax master data from Settings › Accounting & Tax. */
  tax: TaxMasters;
  /** Inventory master data from Settings › Inventory and Warehouses & Bins. */
  inv: InventoryMasters;
}

export interface TaxMasters {
  groups: TaxGroup[];
  codes: TaxCode[];
  excise: ExciseCategory[];
  withholdingGroups: WithholdingGroup[];
}

/** Tax group options for one direction (active groups, plus the current value if inactive). */
export const taxGroupOptions = (tax: TaxMasters, direction: TaxDirection, current: string) =>
  tax.groups
    .filter((g) => g.direction === direction && (g.active || g.code === current))
    .map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` }));

/** Fixed tax code options for one direction, with "none" first. */
export const taxCodeOptions = (tax: TaxMasters, direction: TaxDirection, current: string) => [
  { value: '', label: '— None (use the tax group) —' },
  ...tax.codes
    .filter((c) => c.direction === direction && (c.active || c.code === current))
    .map((c) => ({ value: c.code, label: `${c.code} · ${c.name} (${currentRate(c) ?? '—'}%)` })),
];

/** Withholding group options (active groups, plus the current value if inactive). */
export const withholdingGroupOptions = (tax: TaxMasters, current: string) =>
  tax.withholdingGroups
    .filter((g) => g.active || g.code === current)
    .map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` }));

/** The item's units for a picker ("box · 1 box = 24 pc"), optionally only those usable on purchase or sales documents. */
export const unitOptions = (draft: TabProps['draft'], use?: 'purchase' | 'sales') =>
  itemUnits(draft, use).map((u) => ({ value: u.uom, label: u.uom === draft.inventoryUom ? `${u.uom} · inventory unit` : `${u.uom} · ${uomSummary(draft, u.uom)}` }));

/** " The X group default is Y." when the item's tax setting differs from its group's default, else ''. */
export function groupTaxNote(
  inv: TabProps['inv'],
  draft: TabProps['draft'],
  key: 'purchaseTaxGroup' | 'salesTaxGroup' | 'withholdingGroup' | 'exciseCategory',
) {
  const g = inv.groups.find((x) => x.name === draft.itemGroup);
  const value = g?.[key];
  return value && value !== draft[key] ? ` The ${g.name} group default is ${value}.` : '';
}

/** The item's default tax code, and a reminder that partner/company status can override it. */
export function taxResolution(tax: TaxMasters, groupCode: string, fixedCode: string) {
  const describe = (code: string) => {
    const c = tax.codes.find((x) => x.code === code);
    return c ? `${c.code} ${currentRate(c) ?? '—'}%` : code || '—';
  };
  const override = 'The partner’s or company’s tax status can override it (Settings › Accounting & Tax › Determination rules).';
  if (fixedCode) return `Always ${describe(fixedCode)}. Only company or supplier VAT status overrides a fixed code.`;
  const g = tax.groups.find((x) => x.code === groupCode);
  if (!g) return 'Pick a tax group.';
  return `Default ${describe(g.taxCode)}. ${override}`;
}

export const vendorOptions = (vendors: Partner[]) => [
  { value: '', label: '— None —' },
  ...vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` })),
];

/** Pickers over plain strings. */
export const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** Locked once documents post against the item (SAP: can't change after the first transaction). */
export const LOCKED_HINT = 'Locked: documents have been posted for this item.';
