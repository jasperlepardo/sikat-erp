import { describe, it, expect } from 'vitest';
import type { PriceList } from '../../mocks/partnerMasters';
import type { Item } from '../../mocks/items';
import type {
  DiscountGroupRow,
  PeriodVolumeDiscount,
  SpecialPriceRow,
  SpecialPriceSet,
  VolumeTier,
} from '../../mocks/pricing';
import {
  calculatedItemPrice,
  determinePrice,
  isPriceListValid,
  priceChain,
  roundPrice,
  specialTerms,
  tierFor,
} from '../priceLists';

// --- Minimal fixtures ----------------------------------------------------
// The pricing functions only touch a handful of fields on each type, so we
// build tiny literals rather than resetting the real collections. Casts keep
// the fixtures focused on the fields under test.

const makeList = (over: Partial<PriceList> & Pick<PriceList, 'id' | 'name'>): PriceList => ({
  active: true,
  basePriceListId: '',
  factor: 1,
  source: 'srp',
  rounding: 'none',
  gross: true,
  validFrom: '',
  validTo: '',
  remarks: '',
  itemPrices: [],
  ...over,
});

// An item with a single inventory unit (pc) plus an optional box unit (×24).
const makeItem = (over: Partial<Item> = {}): Item =>
  ({
    id: 'it-1',
    itemGroupId: 'ig-ACC',
    inventoryUom: 'pc',
    uoms: [{ uom: 'pc', qty: 1 }, { uom: 'box', qty: 24 }],
    basePrice: 1000, // gross / SRP
    itemCost: 600,
    ...over,
  }) as unknown as Item;

const tier = (qtyFrom: number, qtyTo: number | null, discountPct: number): VolumeTier => ({
  id: `vt-${qtyFrom}`,
  qtyFrom,
  qtyTo,
  discountPct,
});

// -------------------------------------------------------------------------

describe('roundPrice', () => {
  it('rounds to each configured step', () => {
    expect(roundPrice(1234.56, 'none')).toBe(1234.56);
    expect(roundPrice(1234.56, 'peso')).toBe(1235);
    expect(roundPrice(1234.56, 'ten-centavos')).toBe(1234.6);
    expect(roundPrice(1234.56, 'tens')).toBe(1230);
    expect(roundPrice(1234.56, 'hundreds')).toBe(1200);
  });

  it('rounds half up at each step', () => {
    expect(roundPrice(1250, 'hundreds')).toBe(1300);
    expect(roundPrice(1235, 'tens')).toBe(1240);
  });
});

describe('isPriceListValid', () => {
  const list = makeList({ id: 'prl-x', name: 'Promo', validFrom: '2026-06-01', validTo: '2026-08-31' });

  it('is true inside the window and on the boundaries', () => {
    expect(isPriceListValid(list, '2026-06-01')).toBe(true);
    expect(isPriceListValid(list, '2026-07-15')).toBe(true);
    expect(isPriceListValid(list, '2026-08-31')).toBe(true);
  });

  it('is false outside the window', () => {
    expect(isPriceListValid(list, '2026-05-31')).toBe(false);
    expect(isPriceListValid(list, '2026-09-01')).toBe(false);
  });

  it('treats empty dates as open-ended', () => {
    const open = makeList({ id: 'prl-o', name: 'Open', validFrom: '', validTo: '' });
    expect(isPriceListValid(open, '2000-01-01')).toBe(true);
    expect(isPriceListValid(open, '2100-01-01')).toBe(true);
  });

  it('is false when the list is inactive even inside the window', () => {
    const off = makeList({ ...list, active: false });
    expect(isPriceListValid(off, '2026-07-15')).toBe(false);
  });
});

describe('priceChain', () => {
  const base = makeList({ id: 'prl-base', name: 'Base price', source: 'srp' });
  const wholesale = makeList({ id: 'prl-ws', name: 'Wholesale', basePriceListId: 'prl-base', factor: 0.92, rounding: 'tens' });
  const deep = makeList({ id: 'prl-deep', name: 'Deep', basePriceListId: 'prl-ws', factor: 0.9, rounding: 'none' });

  it('returns just the list itself for an independent list', () => {
    const chain = priceChain(base, [base, wholesale, deep]);
    expect(chain?.map((l) => l.id)).toEqual(['prl-base']);
  });

  it('returns root-to-leaf order for a dependent chain', () => {
    const chain = priceChain(deep, [base, wholesale, deep]);
    expect(chain?.map((l) => l.id)).toEqual(['prl-base', 'prl-ws', 'prl-deep']);
  });

  it('returns undefined when a base is missing', () => {
    const orphan = makeList({ id: 'prl-orph', name: 'Orphan', basePriceListId: 'prl-gone', factor: 0.5 });
    expect(priceChain(orphan, [orphan])).toBeUndefined();
  });

  it('terminates safely on a cyclic chain (A → B → A)', () => {
    const a = makeList({ id: 'prl-a', name: 'A', basePriceListId: 'prl-b', factor: 0.9 });
    const b = makeList({ id: 'prl-b', name: 'B', basePriceListId: 'prl-a', factor: 0.9 });
    expect(priceChain(a, [a, b])).toBeUndefined();
    expect(priceChain(b, [a, b])).toBeUndefined();
  });

  it('terminates safely on a self-referential list', () => {
    const self = makeList({ id: 'prl-self', name: 'Self', basePriceListId: 'prl-self', factor: 0.9 });
    expect(priceChain(self, [self])).toBeUndefined();
  });

  it('uses the passed-in edit of a list rather than the stored copy', () => {
    // `wholesale` edited to point at a different (missing) base — chain breaks.
    const edited = makeList({ ...wholesale, basePriceListId: 'prl-missing' });
    expect(priceChain(edited, [base, wholesale])).toBeUndefined();
  });
});

describe('calculatedItemPrice', () => {
  const base = makeList({ id: 'prl-base', name: 'Base price', source: 'srp' });
  const wholesale = makeList({ id: 'prl-ws', name: 'Wholesale', basePriceListId: 'prl-base', factor: 0.92, rounding: 'tens' });
  const item = makeItem({ basePrice: 1000 });

  it('computes base × factor, rounded, for a dependent list', () => {
    // 1000 (SRP) × 0.92 = 920 → round to tens = 920.
    expect(calculatedItemPrice(wholesale, item, [base, wholesale])).toBe(920);
  });

  it('applies the rounding step to the calculated figure', () => {
    const odd = makeList({ id: 'prl-odd', name: 'Odd', basePriceListId: 'prl-base', factor: 0.937, rounding: 'tens' });
    // 1000 × 0.937 = 937 → round to tens = 940.
    expect(calculatedItemPrice(odd, item, [base, odd])).toBe(940);
  });

  it('for an independent SRP list is the item SRP', () => {
    expect(calculatedItemPrice(base, item, [base])).toBe(1000);
  });

  it('for an independent cost list is the item cost', () => {
    const costList = makeList({ id: 'prl-cost', name: 'Cost', source: 'cost' });
    expect(calculatedItemPrice(costList, makeItem({ itemCost: 600 }), [costList])).toBe(600);
  });

  it('ignores its own manual price (shows what the list would calculate)', () => {
    const manual = makeList({
      ...wholesale,
      itemPrices: [{ itemId: item.id, price: 777 }],
    });
    // skipManual = true for the leaf, so the manual 777 is ignored → 920.
    expect(calculatedItemPrice(manual, item, [base, manual])).toBe(920);
  });

  it('is undefined for a broken chain', () => {
    const orphan = makeList({ id: 'prl-orph', name: 'Orphan', basePriceListId: 'prl-gone', factor: 0.5 });
    expect(calculatedItemPrice(orphan, item, [orphan])).toBeUndefined();
  });
});

describe('tierFor', () => {
  const tiers = [tier(1, 9, 0), tier(10, 49, 3), tier(50, null, 5)];

  it('finds the band a quantity falls in', () => {
    expect(tierFor(tiers, 5)?.discountPct).toBe(0);
    expect(tierFor(tiers, 10)?.discountPct).toBe(3);
    expect(tierFor(tiers, 49)?.discountPct).toBe(3);
    expect(tierFor(tiers, 50)?.discountPct).toBe(5);
    expect(tierFor(tiers, 9999)?.discountPct).toBe(5); // open-ended top tier
  });

  it('returns undefined for a quantity in a gap between tiers', () => {
    const gapped = [tier(1, 9, 0), tier(20, null, 5)];
    expect(tierFor(gapped, 15)).toBeUndefined();
  });

  it('returns undefined below the first tier', () => {
    expect(tierFor([tier(5, null, 2)], 1)).toBeUndefined();
  });
});

describe('specialTerms', () => {
  const row: SpecialPriceRow = {
    id: 'r1',
    itemId: 'it-1',
    unitPrice: 71500,
    discountPct: null,
    validFrom: '',
    validTo: '',
    tiers: [{ id: 't1', qtyFrom: 100, unitPrice: 69900, discountPct: null }],
  };

  it('falls back to the row terms below the first tier', () => {
    const t = specialTerms(row, 10);
    expect(t.unitPrice).toBe(71500);
    expect(t.tier).toBeUndefined();
    expect(t.discountPct).toBe(0);
  });

  it('uses the highest tier reached', () => {
    const t = specialTerms(row, 150);
    expect(t.unitPrice).toBe(69900);
    expect(t.tier?.qtyFrom).toBe(100);
  });

  it('picks the deepest applicable tier when several are reached', () => {
    const multi: SpecialPriceRow = {
      ...row,
      unitPrice: 1480,
      tiers: [
        { id: 't1', qtyFrom: 100, unitPrice: 1450, discountPct: null },
        { id: 't2', qtyFrom: 500, unitPrice: 1420, discountPct: null },
      ],
    };
    expect(specialTerms(multi, 600).unitPrice).toBe(1420);
    expect(specialTerms(multi, 200).unitPrice).toBe(1450);
  });

  it('defaults a null discountPct to 0', () => {
    const pctRow: SpecialPriceRow = { ...row, unitPrice: null, discountPct: 6, tiers: [] };
    expect(specialTerms(pctRow, 1).discountPct).toBe(6);
  });
});

describe('determinePrice', () => {
  // determinePrice reads price lists from the real priceLists collection via
  // listPrice(). Our fixture lists don't exist there, so listPrice() falls back
  // to the item's selling price (unitPrice). We assert against that fallback,
  // which is deterministic from the item fixture.
  const item = makeItem({ id: 'it-1', itemGroupId: 'ig-ACC', basePrice: 1000, itemCost: 600 });
  const partner = { id: 'bp-1', bpGroupId: 'bpg-1', noDiscountGroups: false };

  const call = (o: Partial<Parameters<typeof determinePrice>[0]> = {}) =>
    determinePrice({
      item,
      partner,
      priceListId: 'prl-base',
      uom: 'pc',
      quantity: 1,
      date: '2026-07-15',
      specials: [],
      rules: [],
      groups: [],
      ...o,
    });

  it('falls back to the list price with no discount when nothing matches', () => {
    const lp = call();
    expect(lp.discountPct).toBe(0);
    expect(lp.source.kind).toBe('list');
    expect(lp.basisListId).toBe('prl-base');
    expect(lp.price).toBe(1000); // unitPrice fallback for an unknown list
  });

  it('applies a volume tier discount by inventory-unit quantity', () => {
    const rule: PeriodVolumeDiscount = {
      id: 'pvd-1',
      partnerScope: 'group',
      partnerId: '',
      bpGroupId: 'bpg-1',
      itemScope: 'group',
      itemId: '',
      itemGroupId: 'ig-ACC',
      priceListId: 'prl-base',
      kind: 'volume',
      validFrom: '',
      validTo: '',
      discountPct: 0,
      tiers: [tier(1, 9, 0), tier(10, 49, 3), tier(50, null, 5)],
      remarks: '',
      active: true,
    };
    expect(call({ quantity: 5, rules: [rule] }).discountPct).toBe(0);
    expect(call({ quantity: 10, rules: [rule] }).discountPct).toBe(3);
    const big = call({ quantity: 50, rules: [rule] });
    expect(big.discountPct).toBe(5);
    expect(big.source.kind).toBe('volume');
  });

  it('converts a box quantity to inventory units for the tier (1 box = 24 pc)', () => {
    const rule: PeriodVolumeDiscount = {
      id: 'pvd-2',
      partnerScope: 'group',
      partnerId: '',
      bpGroupId: 'bpg-1',
      itemScope: 'group',
      itemId: '',
      itemGroupId: 'ig-ACC',
      priceListId: 'prl-base',
      kind: 'volume',
      validFrom: '',
      validTo: '',
      discountPct: 0,
      tiers: [tier(1, 23, 0), tier(24, null, 7)],
      remarks: '',
      active: true,
    };
    // 1 box = 24 inventory units → hits the 24+ tier.
    expect(call({ uom: 'box', quantity: 1, rules: [rule] }).discountPct).toBe(7);
  });

  it('lets a fixed special price beat the list price', () => {
    const set: SpecialPriceSet = {
      id: 'spp-1',
      partnerId: 'bp-1',
      priceListId: 'prl-base',
      active: true,
      remarks: '',
      rows: [
        {
          id: 'r1',
          itemId: 'it-1',
          unitPrice: 850,
          discountPct: null,
          validFrom: '2026-01-01',
          validTo: '2026-12-31',
          tiers: [],
        },
      ],
    };
    const lp = call({ specials: [set] });
    expect(lp.source.kind).toBe('special');
    expect(lp.price).toBe(850); // below the 1000 list price
    expect(lp.discountPct).toBe(0);
  });

  it('applies a special-price tier price for a large quantity', () => {
    const set: SpecialPriceSet = {
      id: 'spp-2',
      partnerId: 'bp-1',
      priceListId: 'prl-base',
      active: true,
      remarks: '',
      rows: [
        {
          id: 'r1',
          itemId: 'it-1',
          unitPrice: 850,
          discountPct: null,
          validFrom: '',
          validTo: '',
          tiers: [{ id: 't1', qtyFrom: 100, unitPrice: 800, discountPct: null }],
        },
      ],
    };
    expect(call({ quantity: 150, specials: [set] }).price).toBe(800);
    expect(call({ quantity: 10, specials: [set] }).price).toBe(850);
  });

  it('does not apply a special price outside its validity window', () => {
    const set: SpecialPriceSet = {
      id: 'spp-3',
      partnerId: 'bp-1',
      priceListId: 'prl-base',
      active: true,
      remarks: '',
      rows: [
        {
          id: 'r1',
          itemId: 'it-1',
          unitPrice: 850,
          discountPct: null,
          validFrom: '2026-06-01',
          validTo: '2026-06-30',
          tiers: [],
        },
      ],
    };
    // date 2026-07-15 is past the window → special ignored, list fallback wins.
    const lp = call({ date: '2026-07-15', specials: [set] });
    expect(lp.source.kind).toBe('list');
    expect(lp.price).toBe(1000);
  });

  it('applies a % special as a discount keeping the list price', () => {
    const set: SpecialPriceSet = {
      id: 'spp-4',
      partnerId: 'bp-1',
      priceListId: 'prl-base',
      active: true,
      remarks: '',
      rows: [
        { id: 'r1', itemId: 'it-1', unitPrice: null, discountPct: 6, validFrom: '', validTo: '', tiers: [] },
      ],
    };
    const lp = call({ specials: [set] });
    expect(lp.source.kind).toBe('special');
    expect(lp.discountPct).toBe(6);
    expect(lp.price).toBe(1000); // list price kept; discount shown separately
  });

  it('prefers a period discount over a discount group', () => {
    const rule: PeriodVolumeDiscount = {
      id: 'pvd-3',
      partnerScope: 'group',
      partnerId: '',
      bpGroupId: 'bpg-1',
      itemScope: 'group',
      itemId: '',
      itemGroupId: 'ig-ACC',
      priceListId: 'prl-base',
      kind: 'period',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      discountPct: 10,
      tiers: [],
      remarks: '',
      active: true,
    };
    const group: DiscountGroupRow = {
      id: 'dgr-1',
      bpGroupId: 'bpg-1',
      discounts: [{ itemGroupId: 'ig-ACC', discountPct: 5 }],
      active: true,
    };
    const lp = call({ rules: [rule], groups: [group] });
    expect(lp.source.kind).toBe('period');
    expect(lp.discountPct).toBe(10);
  });

  it('falls back to the discount group when no period/volume rule matches', () => {
    const group: DiscountGroupRow = {
      id: 'dgr-2',
      bpGroupId: 'bpg-1',
      discounts: [{ itemGroupId: 'ig-ACC', discountPct: 5 }],
      active: true,
    };
    const lp = call({ groups: [group] });
    expect(lp.source.kind).toBe('group');
    expect(lp.discountPct).toBe(5);
  });

  it('skips discount groups for a partner flagged noDiscountGroups', () => {
    const group: DiscountGroupRow = {
      id: 'dgr-3',
      bpGroupId: 'bpg-1',
      discounts: [{ itemGroupId: 'ig-ACC', discountPct: 5 }],
      active: true,
    };
    const lp = call({ partner: { ...partner, noDiscountGroups: true }, groups: [group] });
    expect(lp.source.kind).toBe('list');
    expect(lp.discountPct).toBe(0);
  });

  it('prefers a partner-specific rule over a group-scoped one', () => {
    const groupRule: PeriodVolumeDiscount = {
      id: 'pvd-grp',
      partnerScope: 'group',
      partnerId: '',
      bpGroupId: 'bpg-1',
      itemScope: 'group',
      itemId: '',
      itemGroupId: 'ig-ACC',
      priceListId: 'prl-base',
      kind: 'period',
      validFrom: '',
      validTo: '',
      discountPct: 3,
      tiers: [],
      remarks: '',
      active: true,
    };
    const partnerRule: PeriodVolumeDiscount = {
      ...groupRule,
      id: 'pvd-prt',
      partnerScope: 'partner',
      partnerId: 'bp-1',
      itemScope: 'item',
      itemId: 'it-1',
      discountPct: 8,
    };
    const lp = call({ rules: [groupRule, partnerRule] });
    expect(lp.discountPct).toBe(8);
  });

  it('ignores a period discount outside its validity window', () => {
    const rule: PeriodVolumeDiscount = {
      id: 'pvd-exp',
      partnerScope: 'group',
      partnerId: '',
      bpGroupId: 'bpg-1',
      itemScope: 'group',
      itemId: '',
      itemGroupId: 'ig-ACC',
      priceListId: 'prl-base',
      kind: 'period',
      validFrom: '2026-01-01',
      validTo: '2026-03-31',
      discountPct: 10,
      tiers: [],
      remarks: '',
      active: true,
    };
    const lp = call({ date: '2026-07-15', rules: [rule] });
    expect(lp.source.kind).toBe('list');
    expect(lp.discountPct).toBe(0);
  });
});
