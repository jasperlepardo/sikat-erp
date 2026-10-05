/**
 * Discount rules on top of price lists (Inventory › Price Lists). A document line takes its
 * list price, then the first rule that matches, in priority order:
 *   1. Special prices — this exact partner × this exact item
 *   2. Period and volume discounts — this BP or BP group × this item or item group × this list
 *   3. Discount groups — BP group × item group matrix, no dates
 *   4. The price list price, undiscounted
 */

/** A quantity break inside a special price: from `qtyFrom` up to the next tier. */
export interface SpecialPriceTier {
  id: string;
  qtyFrom: number;
  /** Fixed PHP per inventory unit; `null` to use `discountPct` instead. */
  unitPrice: number | null;
  discountPct: number | null;
}

/** One item's negotiated price for the partner: a fixed unit price, or a % off the header list. */
export interface SpecialPriceRow {
  id: string;
  itemId: string;
  /** Fixed PHP per inventory unit. Wins over `discountPct` when both are set. */
  unitPrice: number | null;
  discountPct: number | null;
  /** ISO dates against the posting date; '' = open. */
  validFrom: string;
  validTo: string;
  tiers: SpecialPriceTier[];
}

/** A partner's special prices — one record per partner, never per group. */
export interface SpecialPriceSet {
  id: string;
  partnerId: string;
  /** Base for % specials; reference for fixed ones. */
  priceList: string;
  rows: SpecialPriceRow[];
  remarks: string;
  active: boolean;
}

/** One quantity break of a volume discount. */
export interface VolumeTier {
  id: string;
  qtyFrom: number;
  /** `null` = "and above" (the last tier only). */
  qtyTo: number | null;
  discountPct: number;
}

export type DiscountKind = 'period' | 'volume';

export interface PeriodVolumeDiscount {
  id: string;
  /** Whether `partnerId` (one partner) or `bpGroup` (every partner in the group) is used. */
  partnerScope: 'partner' | 'group';
  partnerId: string;
  bpGroup: string;
  /** Whether `itemId` (one item) or `itemGroup` (every item in the group) is used. */
  itemScope: 'item' | 'group';
  itemId: string;
  itemGroup: string;
  /** Name of the price list whose price is discounted. One rule per list — there's no "all lists". */
  priceList: string;
  kind: DiscountKind;
  /** ISO dates, checked against the document's posting date. Required for period discounts; '' = open. */
  validFrom: string;
  validTo: string;
  /** Period discounts. */
  discountPct: number;
  /** Volume discounts, by line quantity. */
  tiers: VolumeTier[];
  remarks: string;
  active: boolean;
}

/** One row of the discount group matrix: a BP group's discount % per item group (missing = 0%). */
export interface DiscountGroupRow {
  id: string;
  bpGroup: string;
  discounts: Record<string, number>;
  active: boolean;
}

const tier = (id: string, qtyFrom: number, qtyTo: number | null, discountPct: number): VolumeTier => ({ id, qtyFrom, qtyTo, discountPct });

const rule = (r: Partial<PeriodVolumeDiscount> & Pick<PeriodVolumeDiscount, 'id' | 'priceList' | 'kind'>): PeriodVolumeDiscount => ({
  partnerScope: 'group',
  partnerId: '',
  bpGroup: '',
  itemScope: 'group',
  itemId: '',
  itemGroup: '',
  validFrom: '',
  validTo: '',
  discountPct: 0,
  tiers: [],
  remarks: '',
  active: true,
  ...r,
});

export const SEED_PERIOD_VOLUME_DISCOUNTS: PeriodVolumeDiscount[] = [
  rule({
    id: 'pvd-001', kind: 'period', bpGroup: 'Customers – Retail', itemGroup: 'AirPods', priceList: 'Retail',
    validFrom: '2026-10-01', validTo: '2026-10-31', discountPct: 10, remarks: '10.10 sale: 10% off AirPods for walk-in and online customers.',
  }),
  rule({
    id: 'pvd-002', kind: 'period', bpGroup: 'Customers – Trade', itemGroup: 'Mac', priceList: 'Wholesale',
    validFrom: '2026-06-01', validTo: '2026-08-31', discountPct: 4, remarks: 'Back-to-school corporate Mac promo.',
  }),
  rule({
    id: 'pvd-003', kind: 'volume', bpGroup: 'Customers – Government', itemGroup: 'iPad', priceList: 'Government',
    tiers: [tier('t1', 1, 9, 0), tier('t2', 10, 49, 3), tier('t3', 50, null, 5)],
    remarks: 'Classroom rollouts: deeper discount for bigger lots.',
  }),
  rule({
    id: 'pvd-004', kind: 'volume', partnerScope: 'partner', partnerId: 'bp-013', itemGroup: 'Accessories', priceList: 'Last purchase price',
    tiers: [tier('t1', 1, 49, 0), tier('t2', 50, 199, 2), tier('t3', 200, null, 4)],
    remarks: 'Techzone accessories supply agreement: volume rebate on the invoice price.',
  }),
];

export const SEED_DISCOUNT_GROUPS: DiscountGroupRow[] = [
  { id: 'dgr-001', bpGroup: 'Customers – Trade', discounts: { iPhone: 2, iPad: 3, Mac: 3, Accessories: 5 }, active: true },
  {
    id: 'dgr-002', bpGroup: 'Customers – Government',
    discounts: { iPhone: 3, iPad: 3, Mac: 3, 'Apple Watch': 3, AirPods: 3, Accessories: 3 }, active: true,
  },
  { id: 'dgr-003', bpGroup: 'Vendors – Local', discounts: { Accessories: 1.5 }, active: true },
];

const special = (id: string, itemId: string, r: Partial<SpecialPriceRow>): SpecialPriceRow => ({
  id, itemId, unitPrice: null, discountPct: null, validFrom: '', validTo: '', tiers: [], ...r,
});

export const SEED_SPECIAL_PRICES: SpecialPriceSet[] = [
  {
    id: 'spp-001', partnerId: 'bp-009', priceList: 'Government', active: true,
    remarks: 'DepEd Pasig iPad rollout contract (PRJ-002), awarded price for the 2026 school year.',
    rows: [
      special('r1', 'apl-0079', {
        unitPrice: 71500, validFrom: '2026-06-01', validTo: '2027-05-31',
        tiers: [{ id: 't1', qtyFrom: 100, unitPrice: 69900, discountPct: null }],
      }),
    ],
  },
  {
    id: 'spp-002', partnerId: 'bp-003', priceList: 'Wholesale', active: true,
    remarks: 'Bayanihan Savings Bank laptop refresh: 6% off Wholesale through 2026.',
    rows: [
      special('r1', 'apl-0239', { discountPct: 6, validFrom: '2026-01-01', validTo: '2026-12-31' }),
      special('r2', 'apl-0240', { discountPct: 6, validFrom: '2026-01-01', validTo: '2026-12-31' }),
    ],
  },
  {
    id: 'spp-003', partnerId: 'bp-013', priceList: 'Last purchase price', active: true,
    remarks: 'Techzone contract buy price for the 20W adapter.',
    rows: [special('r1', 'apl-0361', { unitPrice: 1480, tiers: [{ id: 't1', qtyFrom: 500, unitPrice: 1420, discountPct: null }] })],
  },
];
