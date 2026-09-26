import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Errors } from '../../../../components/form/fields';
import type { ExciseCategory, TaxCode, TaxGroup, TaxDirection } from '../../../../mocks/taxes';
import { TAX_ZONES } from '../../../../mocks/taxes';

export type Draft = Omit<Item, 'id'> & { id?: string };

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  /** Vendors (partners with the vendor role), for default / preferred vendor pickers. */
  vendors: Partner[];
  /** Tax master data from Settings › Accounting & Tax. */
  tax: TaxMasters;
}

export interface TaxMasters {
  groups: TaxGroup[];
  codes: TaxCode[];
  excise: ExciseCategory[];
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
    .map((c) => ({ value: c.code, label: `${c.code} · ${c.name} (${c.rate}%)` })),
];

/** "Domestic → OV12 12% · Government → OVG12 12% · …" for a group, or the fixed code. */
export function taxResolution(tax: TaxMasters, groupCode: string, fixedCode: string) {
  const describe = (code: string) => {
    const c = tax.codes.find((x) => x.code === code);
    return c ? `${c.code} ${c.rate}%` : code || '—';
  };
  if (fixedCode) return `Always ${describe(fixedCode)}, whatever the partner's tax zone.`;
  const g = tax.groups.find((x) => x.code === groupCode);
  if (!g) return 'Pick a tax group.';
  return TAX_ZONES.map((z) => `${z.label.split(' ')[0]} → ${describe(g.codes[z.value])}`).join(' · ');
}

export const vendorOptions = (vendors: Partner[]) => [
  { value: '', label: '— None —' },
  ...vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` })),
];

/** Pickers over plain strings. */
export const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** Locked once documents post against the item (SAP: can't change after the first transaction). */
export const LOCKED_HINT = 'Locked: documents have been posted for this item.';
