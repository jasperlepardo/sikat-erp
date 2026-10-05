import {
  SUBLEVEL_TIERS,
  TIER_LABEL,
  binCode,
  blankBin,
  type BinLocation,
  type BinSublevel,
  type SublevelTier,
} from '../mocks/binLocations';
import type { Item } from '../mocks/items';
import { listTransfers } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { binLocations, binSublevels } from './inventoryMasters';
import { newId } from './useCollectionRows';

export { binLocations, binSublevels };

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, undefined, { numeric: true });

/** A warehouse's bins for a picker: active ones in code order, plus `current` if it's been deactivated. */
export function binsOf(bins: readonly BinLocation[], warehouse: string, current = '') {
  return bins.filter((b) => b.warehouse === warehouse && (b.active || b.code === current)).sort(byCode);
}

/** Where inbound stock lands by default: the warehouse's first active receiving bin. */
export const receivingBin = (bins: readonly BinLocation[], warehouse: string) =>
  binsOf(bins, warehouse).find((b) => b.receiving);

/** A warehouse's codes for one tier, in code order. */
export const sublevelsOf = (rows: readonly BinSublevel[], warehouse: string, tier: SublevelTier) =>
  rows.filter((r) => r.warehouse === warehouse && r.tier === tier).sort(byCode);

/**
 * What's in a bin. Per-bin quantities aren't tracked yet, so an item's stock in a
 * warehouse counts as sitting in its default bin there.
 */
export function binStock(bin: Pick<BinLocation, 'warehouse' | 'code'>, items: readonly Item[]) {
  let qty = 0;
  let weight = 0;
  let count = 0;
  for (const item of items) {
    const w = item.warehouses.find((x) => x.code === bin.warehouse && x.defaultBin === bin.code);
    if (!w || w.inStock <= 0) continue;
    count += 1;
    qty += w.inStock;
    const unit = item.uoms.find((u) => u.uom === item.inventoryUom) ?? item.uoms[0];
    weight += w.inStock * (unit?.grossWeight || unit?.netWeight || 0);
  }
  return { qty, weight: Math.round(weight * 100) / 100, items: count };
}

/**
 * Why `bin` can't take part in an inventory transfer of `item` (null when it can).
 * `direction` is 'out' for the from-bin and 'in' for the to-bin.
 */
export function transferBlock(bin: BinLocation | undefined, item: Item, uom: string, direction: 'in' | 'out'): string | null {
  if (!bin) return null;
  if (!bin.active) return `${bin.code} is inactive.`;
  const t = bin.transactionRestriction;
  if (t === 'all') return `${bin.code} is locked to all transactions.`;
  if (t === 'inbound' && direction === 'out') return `${bin.code} takes inbound transactions only.`;
  if (t === 'outbound' && direction === 'in') return `${bin.code} takes outbound transactions only.`;
  if (direction === 'out') return null;
  if (bin.itemRestriction === 'item' && bin.restrictedItem !== item.itemNo) return `${bin.code} only holds ${bin.restrictedItem}.`;
  if (bin.itemRestriction === 'itemGroup' && bin.restrictedItemGroup !== item.itemGroup)
    return `${bin.code} only holds ${bin.restrictedItemGroup} items.`;
  if (bin.uomRestriction === 'uom' && bin.restrictedUom !== uom) return `${bin.code} only takes ${bin.restrictedUom}.`;
  return null;
}

// ── Bin location management: generate a range ──────────────────────────────

export interface Range {
  from: string;
  to: string;
}

/** The codes of a tier within a From–To range (blank ends are open). */
export function inRange(codes: string[], { from, to }: Range) {
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return codes.filter((c) => (!from || cmp(c, from) >= 0) && (!to || cmp(c, to) <= 0));
}

/**
 * A pattern for generated text fields. `{WH}`, `{AISLE}`, `{SHELF}`, `{LEVEL}` are the
 * bin's segments; `{SEQ}` counts from 1 across the run, `{SEQ:3}` zero-pads it.
 */
export function fillPattern(pattern: string, bin: Pick<BinLocation, 'warehouse' | 'aisle' | 'shelf' | 'level'>, seq: number) {
  return pattern
    .replace(/\{WH\}/gi, bin.warehouse)
    .replace(/\{AISLE\}/gi, bin.aisle)
    .replace(/\{SHELF\}/gi, bin.shelf)
    .replace(/\{LEVEL\}/gi, bin.level)
    .replace(/\{SEQ(?::(\d+))?\}/gi, (_, w?: string) => String(seq).padStart(Number(w ?? 0), '0'));
}

export interface GenerateInput {
  warehouse: string;
  ranges: Record<SublevelTier, Range>;
  /** Properties every new bin gets. */
  defaults: Partial<BinLocation>;
  patterns: { description: string; barcode: string; altSortCode: string };
}

/** The bins a run would add, and the codes it skips because they already exist. */
export function planGeneration(input: GenerateInput, subs: readonly BinSublevel[], bins: readonly BinLocation[]) {
  const [aisles, shelves, levels] = SUBLEVEL_TIERS.map((t) =>
    inRange(sublevelsOf(subs, input.warehouse, t).map((s) => s.code), input.ranges[t]),
  );
  const existing = new Set(bins.map((b) => b.code));
  const add: BinLocation[] = [];
  const skipped: string[] = [];
  let seq = 0;
  for (const aisle of aisles)
    for (const shelf of shelves)
      for (const level of levels) {
        const code = binCode(input.warehouse, aisle, shelf, level);
        if (existing.has(code)) {
          skipped.push(code);
          continue;
        }
        seq += 1;
        const at = { warehouse: input.warehouse, aisle, shelf, level };
        add.push(
          blankBin({
            ...input.defaults,
            ...at,
            id: newId('bin'),
            receiving: false,
            description: fillPattern(input.patterns.description, at, seq),
            barcode: fillPattern(input.patterns.barcode, at, seq),
            altSortCode: fillPattern(input.patterns.altSortCode, at, seq),
          }),
        );
      }
  return { add, skipped };
}

export async function generateBins(add: BinLocation[]) {
  const updatedAt = new Date().toISOString();
  // Each save stands alone, so they go together rather than one fake round trip at a time.
  await Promise.all(add.map((b) => binLocations.save({ ...b, updatedAt })));
}

// ── Bin location code modification ──────────────────────────────────────────

export interface RenameInput {
  warehouse: string;
  ranges: Record<SublevelTier, Range>;
  /** New value per tier; a tier left out keeps its codes. */
  changes: Partial<Record<SublevelTier, string>>;
  reason: string;
}

export interface RenameRow {
  bin: BinLocation;
  to: Pick<BinLocation, 'aisle' | 'shelf' | 'level' | 'code'>;
  /** Why this rename can't go ahead. */
  conflict?: string;
}

/** Each matching bin with its new code. A rename that lands on another bin's code is a conflict. */
export function planRename(input: RenameInput, bins: readonly BinLocation[]): RenameRow[] {
  const match = (b: BinLocation, t: SublevelTier) => inRange([b[t]], input.ranges[t]).length > 0;
  const picked = bins.filter((b) => b.warehouse === input.warehouse && SUBLEVEL_TIERS.every((t) => match(b, t))).sort(byCode);
  const rows = picked.map((bin) => {
    const seg = (t: SublevelTier) => input.changes[t]?.trim().toUpperCase() || bin[t];
    const [aisle, shelf, level] = SUBLEVEL_TIERS.map(seg);
    return { bin, to: { aisle, shelf, level, code: binCode(bin.warehouse, aisle, shelf, level) } } as RenameRow;
  });
  const moving = new Set(rows.filter((r) => r.to.code !== r.bin.code).map((r) => r.bin.code));
  const staying = new Set(bins.filter((b) => !moving.has(b.code)).map((b) => b.code));
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.to.code === r.bin.code) continue;
    if (staying.has(r.to.code)) r.conflict = `${r.to.code} already exists.`;
    else if (seen.has(r.to.code)) r.conflict = `${seen.get(r.to.code)} also becomes ${r.to.code}.`;
    seen.set(r.to.code, r.bin.code);
  }
  return rows;
}

/**
 * Rename the bins. Each keeps its id, properties and stock; items' default bins follow the
 * new code, and a new segment value joins the warehouse's sublevel codes. Posted documents
 * keep the old code. Returns the draft transfers still on an old code, to review.
 */
export async function renameBins(rows: RenameRow[], reason: string) {
  const changed = rows.filter((r) => r.to.code !== r.bin.code);
  if (changed.some((r) => r.conflict)) throw new Error('Resolve the conflicts first.');
  const renamed = new Map(changed.map((r) => [r.bin.code, r.to.code]));
  const updatedAt = new Date().toISOString();

  const subs = await binSublevels.list();
  const newSubs: BinSublevel[] = [];
  for (const r of changed)
    for (const t of SUBLEVEL_TIERS) {
      const code = r.to[t];
      const known = [...subs, ...newSubs].some((s) => s.warehouse === r.bin.warehouse && s.tier === t && s.code === code);
      if (!known) newSubs.push({ id: newId('bsl'), warehouse: r.bin.warehouse, tier: t, code, description: `${TIER_LABEL[t]} ${code}`, active: true });
    }

  // Independent writes, so they go together rather than one fake round trip at a time.
  const affected = (await listItems()).filter((item) => item.warehouses.some((w) => renamed.has(w.defaultBin)));
  await Promise.all([
    ...newSubs.map((row) => binSublevels.save(row)),
    ...changed.map((r) => binLocations.save({ ...r.bin, ...r.to, updatedAt, reason: reason || `Renamed from ${r.bin.code}` })),
    ...affected.map((item) =>
      saveItem({ ...item, warehouses: item.warehouses.map((w) => ({ ...w, defaultBin: renamed.get(w.defaultBin) ?? w.defaultBin })) }),
    ),
  ]);
  const items = affected.length;

  const drafts = (await listTransfers()).filter(
    (t) => t.status === 'Draft' && (renamed.has(t.toBin) || t.lines.some((l) => renamed.has(l.fromBin) || renamed.has(l.toBin))),
  );
  return { bins: changed.length, items, drafts };
}
