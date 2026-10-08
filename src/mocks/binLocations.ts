/**
 * Bin locations: storage positions inside a bin-enabled warehouse, addressed by
 * Aisle › Shelf › Level. Each tier's codes are a per-warehouse list (sublevel codes),
 * and a bin's code is the warehouse plus its three segments: WH-MNL-A-01-02.
 * Items' default bins and transfer lines store that code.
 */

export type SublevelTier = 'aisle' | 'shelf' | 'level';
export const SUBLEVEL_TIERS: SublevelTier[] = ['aisle', 'shelf', 'level'];
export const TIER_LABEL: Record<SublevelTier, string> = { aisle: 'Aisle', shelf: 'Shelf', level: 'Level' };

/** Joins the warehouse and sublevel segments of a bin code. */
export const BIN_SEPARATOR = '-';

/** One aisle, shelf or level code a warehouse's bins can use. */
export interface BinSublevel {
  id: string;
  warehouse: string;
  tier: SublevelTier;
  code: string;
  description: string;
  active: boolean;
}

export type ItemRestriction = 'none' | 'item' | 'singleItem' | 'itemGroup' | 'singleItemGroup';
export type UomRestriction = 'none' | 'uom' | 'singleUom' | 'uomGroup' | 'singleUomGroup';
export type BatchRestriction = 'none' | 'singleBatch';
export type TransactionRestriction = 'none' | 'all' | 'inbound' | 'outbound' | 'transferAndCount';

export const ITEM_RESTRICTIONS: { value: ItemRestriction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'item', label: 'Specific item' },
  { value: 'singleItem', label: 'Single item only' },
  { value: 'itemGroup', label: 'Specific item group' },
  { value: 'singleItemGroup', label: 'Single item group only' },
];
export const UOM_RESTRICTIONS: { value: UomRestriction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'uom', label: 'Specific UoM' },
  { value: 'singleUom', label: 'Single UoM only' },
  { value: 'uomGroup', label: 'Specific UoM group' },
  { value: 'singleUomGroup', label: 'Single UoM group only' },
];
export const BATCH_RESTRICTIONS: { value: BatchRestriction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'singleBatch', label: 'Single batch' },
];
export const TRANSACTION_RESTRICTIONS: { value: TransactionRestriction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'all', label: 'All transactions (bin locked)' },
  { value: 'inbound', label: 'Inbound only' },
  { value: 'outbound', label: 'Outbound only' },
  { value: 'transferAndCount', label: 'Inventory transfers and counting only' },
];

export interface BinLocation {
  id: string;
  /** Warehouse code. Fixed once the bin is added. */
  warehouse: string;
  aisle: string;
  shelf: string;
  level: string;
  /** Warehouse-Aisle-Shelf-Level. Changed only through Modify bin codes. */
  code: string;
  active: boolean;
  /** The warehouse's staging bin for inbound stock; one active per warehouse. */
  receiving: boolean;
  /** Outbound documents never pick this bin automatically. */
  excludeAutoAlloc: boolean;
  description: string;
  barcode: string;
  /** Sorts pick and put-away lists when the walk order differs from code order. */
  altSortCode: string;
  /** 0 = not set. Advisory, for replenishment. */
  minQty: number;
  /** 0 = no limit. */
  maxQty: number;
  /** kg; 0 = no limit. */
  maxWeight: number;
  itemRestriction: ItemRestriction;
  /** Item No., for "Specific item". */
  restrictedItem: string;
  /** Item group name, for "Specific item group". */
  restrictedItemGroupId: string;
  uomRestriction: UomRestriction;
  /** UoM code, for "Specific UoM". */
  restrictedUom: string;
  /** UoM group code, for "Specific UoM group". */
  restrictedUomGroup: string;
  batchRestriction: BatchRestriction;
  transactionRestriction: TransactionRestriction;
  /** ISO timestamp of the last save. */
  updatedAt: string;
  /** Why the bin was last changed. */
  reason: string;
}

export const binCode = (warehouse: string, aisle: string, shelf: string, level: string) =>
  [warehouse, aisle, shelf, level].join(BIN_SEPARATOR);

export const blankBin = (patch: Partial<BinLocation> = {}): BinLocation => {
  const bin: BinLocation = {
    id: '',
    warehouse: '',
    aisle: '',
    shelf: '',
    level: '',
    code: '',
    active: true,
    receiving: false,
    excludeAutoAlloc: false,
    description: '',
    barcode: '',
    altSortCode: '',
    minQty: 0,
    maxQty: 0,
    maxWeight: 0,
    itemRestriction: 'none',
    restrictedItem: '',
    restrictedItemGroupId: '',
    uomRestriction: 'none',
    restrictedUom: '',
    restrictedUomGroup: '',
    batchRestriction: 'none',
    transactionRestriction: 'none',
    updatedAt: '',
    reason: '',
    ...patch,
  };
  return { ...bin, code: bin.warehouse && bin.aisle && bin.shelf && bin.level ? binCode(bin.warehouse, bin.aisle, bin.shelf, bin.level) : '' };
};

// ── Seed: the Pasig warehouse ────────────────────────────────────────────────
// Aisle A holds iPhone and iPad, B Mac, C accessories; R is the receiving dock.
// Shelves 01–02, levels 01 (floor) to 03 (top). C-02-03 is the quarantine bin.

const WH = 'WH-MNL';
const SEEDED_AT = '2026-09-01T08:00:00+08:00';

const sub = (tier: SublevelTier, code: string, description: string): BinSublevel => ({
  id: `bsl-${WH}-${tier}-${code}`,
  warehouse: WH,
  tier,
  code,
  description,
  active: true,
});

export const SEED_BIN_SUBLEVELS: BinSublevel[] = [
  sub('aisle', 'A', 'Aisle A · iPhone & iPad'),
  sub('aisle', 'B', 'Aisle B · Mac'),
  sub('aisle', 'C', 'Aisle C · Accessories'),
  sub('aisle', 'R', 'Receiving dock'),
  sub('shelf', '00', 'Floor staging'),
  sub('shelf', '01', 'Shelf 01'),
  sub('shelf', '02', 'Shelf 02'),
  sub('level', '00', 'Floor'),
  sub('level', '01', 'Level 01 · bottom'),
  sub('level', '02', 'Level 02 · middle'),
  sub('level', '03', 'Level 03 · top'),
];

const bin = (aisle: string, shelf: string, level: string, patch: Partial<BinLocation> = {}) =>
  blankBin({
    id: `bin-${WH}-${aisle}-${shelf}-${level}`,
    warehouse: WH,
    aisle,
    shelf,
    level,
    barcode: `${WH}${aisle}${shelf}${level}`.replace(/-/g, ''),
    updatedAt: SEEDED_AT,
    reason: 'Initial warehouse setup',
    ...patch,
  });

const AISLE_GROUP: Record<string, string> = { B: 'ig-MAC', C: 'ig-ACC' };

export const SEED_BINS: BinLocation[] = [
  bin('R', '00', '00', { receiving: true, description: 'Receiving dock — put away within the day', excludeAutoAlloc: true, transactionRestriction: 'transferAndCount' }),
  ...['A', 'B', 'C'].flatMap((aisle, a) =>
    ['01', '02'].flatMap((shelf, s) =>
      ['01', '02', '03'].map((level, l) =>
        bin(aisle, shelf, level, {
          description: `Bin ${level} on shelf ${shelf}, aisle ${aisle}`,
          altSortCode: String(a * 6 + s * 3 + l + 1).padStart(3, '0'),
          maxQty: aisle === 'B' ? 40 : 200,
          maxWeight: aisle === 'B' ? 120 : 80,
          ...(AISLE_GROUP[aisle] ? { itemRestriction: 'itemGroup' as const, restrictedItemGroupId: AISLE_GROUP[aisle] } : {}),
          ...(aisle === 'C' && shelf === '02' && level === '03'
            ? {
                description: 'Quarantine — damaged / RMA stock awaiting disposition',
                excludeAutoAlloc: true,
                transactionRestriction: 'transferAndCount' as const,
                itemRestriction: 'none' as const,
                restrictedItemGroupId: '',
                reason: 'Set aside for RMA stock after the Sep 2026 audit',
              }
            : {}),
        }),
      ),
    ),
  ),
];
