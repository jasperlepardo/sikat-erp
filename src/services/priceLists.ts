/**
 * Price determination for a document line (Inventory › Price Lists).
 *
 * List price: an item's hand-set price on the list if it has one; otherwise an independent list
 * takes the item's cost or SRP, and a dependent list is its base list's price × factor, rounded.
 * Nothing is stored for calculated prices, so editing a base list reprices every list below it.
 *
 * Then the first rule that matches wins: a special price for this partner × item, then period
 * and volume discounts, then discount groups. A fixed special price becomes the unit price; any
 * % rule keeps the list price as the unit price and goes in Discount %, so the document shows both.
 */
import { PRICE_ROUNDING, type PriceList, type PriceRounding } from '../mocks/partnerMasters';
import {
  SEED_DISCOUNT_GROUPS,
  SEED_PERIOD_VOLUME_DISCOUNTS,
  SEED_SPECIAL_PRICES,
  type DiscountGroupRow,
  type PeriodVolumeDiscount,
  type SpecialPriceRow,
  type SpecialPriceSet,
  type VolumeTier,
} from '../mocks/pricing';
import { itemsPerUom, unitCost, unitPrice, type Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import { formatAmount } from './format';
import { priceLists } from './partnerMasters';
import { createCollection } from './store';

export const specialPrices = createCollection<SpecialPriceSet>('sikat-erp:special-prices', SEED_SPECIAL_PRICES, 'spp');
export const periodVolumeDiscounts = createCollection<PeriodVolumeDiscount>('sikat-erp:period-volume-discounts', SEED_PERIOD_VOLUME_DISCOUNTS, 'pvd');
export const discountGroups = createCollection<DiscountGroupRow>('sikat-erp:discount-groups', SEED_DISCOUNT_GROUPS, 'dgr');

/** Chains deeper than this are treated as broken (and are a circular reference in practice). */
const MAX_DEPTH = 10;

const STEP: Record<PriceRounding, number> = { none: 0.01, peso: 1, 'ten-centavos': 0.1, tens: 10, hundreds: 100 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const roundPrice = (amount: number, rounding: PriceRounding) => round2(Math.round(amount / STEP[rounding]) * STEP[rounding]);

export const roundingLabel = (rounding: PriceRounding) => PRICE_ROUNDING.find((r) => r.value === rounding)?.label ?? rounding;

const byName = (all: readonly PriceList[], name: string) => all.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());

/**
 * The lists a price passes through, from the independent root to `list`. `undefined` when
 * a base is missing or the chain loops back on itself.
 */
export function priceChain(list: PriceList, all: readonly PriceList[]): PriceList[] | undefined {
  // `list` may be an unsaved edit of a row in `all`: use the edit.
  const pool = [...all.filter((l) => l.id !== list.id), list];
  const chain = [list];
  let current = list;
  while (current.basePriceList) {
    const base = byName(pool, current.basePriceList);
    if (!base || chain.some((l) => l.id === base.id) || chain.length > MAX_DEPTH) return undefined;
    chain.unshift(base);
    current = base;
  }
  return chain;
}

const manualPrice = (list: PriceList, item: Item) => list.itemPrices.find((p) => p.itemId === item.id)?.price;

/**
 * Price of one `uom` of the item down a chain. `skipManual` leaves out the last list's own
 * hand-set price — what the list would calculate, shown next to a manual price.
 */
function chainPrice(chain: PriceList[], item: Item, uom: string, skipManual = false): number {
  const perUnit = itemsPerUom(item, uom) ?? 1;
  return chain.reduce((price, l, i) => {
    const manual = skipManual && i === chain.length - 1 ? undefined : manualPrice(l, item);
    if (manual !== undefined) return round2(manual * perUnit);
    if (i === 0) return l.source === 'cost' ? unitCost(item, uom) : unitPrice(item, uom);
    return roundPrice(price * l.factor, l.rounding);
  }, 0);
}

/** "Base price × 0.92 → Wholesale", for hints. */
export function describeChain(chain: PriceList[]) {
  const [root, ...rest] = chain;
  const rootLabel = `${root.name} (item ${root.source === 'cost' ? 'cost' : 'SRP'})`;
  return rest.reduce((text, l) => `${text} × ${l.factor} → ${l.name}`, rootLabel);
}

/** The worked example under a list's settings: what ₱`sample` at the root of the chain becomes here. */
export function samplePrice(list: PriceList, all: readonly PriceList[], sample = 10000) {
  const chain = priceChain(list, all);
  if (!chain) return undefined;
  const price = chain.slice(1).reduce((p, l) => roundPrice(p * l.factor, l.rounding), sample);
  return `₱${formatAmount(sample)} → ₱${formatAmount(price)}`;
}

/** The list's price for an item per inventory unit, calculated (ignoring its own manual price). */
export function calculatedItemPrice(list: PriceList, item: Item, all: readonly PriceList[]) {
  const chain = priceChain(list, all);
  return chain ? chainPrice(chain, item, item.inventoryUom, true) : undefined;
}

/** Whether a list or rule is in force on `date` (ISO). */
const inDates = (r: { validFrom: string; validTo: string }, date: string) =>
  (!r.validFrom || r.validFrom <= date) && (!r.validTo || date <= r.validTo);

export const isPriceListValid = (list: PriceList, date: string) => list.active && inDates(list, date);

/**
 * Price in PHP of one `uom` of the item from a price list. An unknown or broken list falls back
 * to the item's selling price, so a document never goes blank because of a list setup problem.
 */
export function listPrice(item: Item, priceListName: string, uom: string, all: readonly PriceList[] = priceLists.snapshot()) {
  const list = byName(all, priceListName);
  const chain = list && priceChain(list, all);
  return chain ? chainPrice(chain, item, uom) : unitPrice(item, uom);
}

/** The tier a line quantity falls in; none when it's in a gap between tiers. */
export const tierFor = (tiers: VolumeTier[], qty: number) =>
  tiers.find((t) => qty >= t.qtyFrom && (t.qtyTo === null || qty <= t.qtyTo));

/** The price or % a special price row gives for a quantity (inventory units): the highest tier reached, else the row. */
export function specialTerms(row: SpecialPriceRow, qty: number) {
  const tier = [...row.tiers].sort((a, b) => b.qtyFrom - a.qtyFrom).find((t) => qty >= t.qtyFrom);
  const terms = tier ?? row;
  return { unitPrice: terms.unitPrice, discountPct: terms.discountPct ?? 0, tier };
}

export interface PriceSource {
  kind: 'special' | 'period' | 'volume' | 'group' | 'list';
  /** "Volume discount 50+ · Techzone accessories…", for the line hint. */
  label: string;
}

export interface LinePrice {
  /** PHP per `uom`, before discount. */
  price: number;
  discountPct: number;
  source: PriceSource;
}

/**
 * Price and discount for a document line. A period or volume rule for this exact partner beats
 * one for its group, and one for this exact item beats one for its item group.
 */
export function determinePrice(o: {
  item: Item;
  partner?: Pick<Partner, 'id' | 'group' | 'noDiscountGroups'>;
  priceList: string;
  uom: string;
  quantity: number;
  date: string;
  specials?: readonly SpecialPriceSet[];
  rules?: readonly PeriodVolumeDiscount[];
  groups?: readonly DiscountGroupRow[];
}): LinePrice {
  const { item, partner, date } = o;
  const perUnit = itemsPerUom(item, o.uom) ?? 1;
  const qty = o.quantity * perUnit;

  const set = partner && (o.specials ?? specialPrices.snapshot()).find((s) => s.active && s.partnerId === partner.id);
  const special = set?.rows.find((r) => r.itemId === item.id && inDates(r, date));
  if (set && special) {
    const t = specialTerms(special, qty);
    const at = t.tier ? ` (${t.tier.qtyFrom}+)` : '';
    if (t.unitPrice !== null) return { price: round2(t.unitPrice * perUnit), discountPct: 0, source: { kind: 'special', label: `Special price${at}` } };
    return {
      price: listPrice(item, set.priceList, o.uom),
      discountPct: t.discountPct,
      source: { kind: 'special', label: `Special price${at}: ${t.discountPct}% off ${set.priceList}` },
    };
  }

  const price = listPrice(item, o.priceList, o.uom);
  const rules = o.rules ?? periodVolumeDiscounts.snapshot();
  const groups = o.groups ?? discountGroups.snapshot();

  const specificity = (r: PeriodVolumeDiscount) => (r.partnerScope === 'partner' ? 2 : 0) + (r.itemScope === 'item' ? 1 : 0);
  const matching = rules
    .filter(
      (r) =>
        r.active &&
        r.priceList === o.priceList &&
        inDates(r, date) &&
        (r.partnerScope === 'partner' ? r.partnerId === partner?.id : !!partner && r.bpGroup === partner.group) &&
        (r.itemScope === 'item' ? r.itemId === item.id : r.itemGroup === item.itemGroup),
    )
    .sort((a, b) => specificity(b) - specificity(a));
  for (const r of matching) {
    if (r.kind === 'period') return { price, discountPct: r.discountPct, source: { kind: 'period', label: `Period discount ${r.discountPct}%` } };
    // A quantity in a gap between tiers isn't covered: fall through to the next rule.
    const t = tierFor(r.tiers, qty);
    if (t) return { price, discountPct: t.discountPct, source: { kind: 'volume', label: `Volume discount ${tierLabel(t)}: ${t.discountPct}%` } };
  }

  if (partner && !partner.noDiscountGroups) {
    const row = groups.find((g) => g.active && g.bpGroup === partner.group);
    const pct = row?.discounts[item.itemGroup];
    if (pct) return { price, discountPct: pct, source: { kind: 'group', label: `Discount group ${partner.group} × ${item.itemGroup}: ${pct}%` } };
  }

  return { price, discountPct: 0, source: { kind: 'list', label: o.priceList } };
}

export const tierLabel = (t: VolumeTier) => (t.qtyTo === null ? `${t.qtyFrom}+` : `${t.qtyFrom}–${t.qtyTo}`);
