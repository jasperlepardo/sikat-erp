import { round2 } from './num';

/** The quantity, price and discount a document line is priced from. */
type PricedLine = { quantity: number; unitPrice: number; discountPct: number };

/** The unit price less the line discount. */
export const priceAfterDiscount = (l: Pick<PricedLine, 'unitPrice' | 'discountPct'>) => l.unitPrice * (1 - l.discountPct / 100);

/** A line's net: quantity × discounted price, to the centavo (PO, purchase request and sales order lines). */
export const lineNet = (l: PricedLine) => round2(l.quantity * priceAfterDiscount(l));

/** Inventory units in `qty` (by default the line's quantity) of the line's unit of measure. */
export const inventoryQty = (l: { quantity: number; itemsPerUnit?: number }, qty = l.quantity) => qty * (l.itemsPerUnit || 1);
