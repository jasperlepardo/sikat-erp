/**
 * Goods receipt POs (GRPO). Fields follow the SAP B1 Goods Receipt PO field map: header,
 * Contents (lines), Logistics, Accounting and footer.
 *
 * Settled here, for the prototype:
 * - Documents are item-type only. Services are received as non-stock items, as on purchase
 *   orders, so the Item/Service type switch and Summary Type are left out.
 * - Lines copied from a PO keep a link to the PO line (base document). They can receive up to
 *   the PO line's open quantity, in the PO line's unit; the unit can't change.
 * - Adding a receipt posts it: stock goes up, the item cost re-averages and the PO lines count
 *   it as received. After that only remarks change. Close stops it being invoiced; Cancel
 *   reverses the stock and reopens the PO lines.
 * - Bin allocation is one bin per line. Bins don't carry their own quantities yet.
 * - Open qty is what's left to invoice: received less what A/P invoices copied from it have
 *   billed. The receipt closes once every line is fully invoiced.
 * - Return Reason belongs to returns, and Central Bank Ind. to other countries' localizations.
 *   Both are left out.
 */
import type { DocumentSeries } from './common';
import { seedBinCode } from './binLocations';
import { plId } from './masters';
import { SEED_ITEMS } from './items';
import { SEED_RATES } from './currencies';
import { PO_SERIES, SEED_PURCHASE_ORDERS, type PoReference } from './purchaseOrders';
// The last delivery date, but never after the seed's as-of day (it records goods already received) and never before the PO.
import { receiptDate } from './supplyPlan';


export type GrStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const GR_STATUSES: GrStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface GrLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Defaults from the item (or the PO line); editing it here doesn't change either. */
  name: string;
  description: string;
  /** Received, in the line's unit. */
  quantity: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one line unit. */
  itemsPerUnit: number;
  warehouse: string;
  /** Where the stock is put away, when the warehouse uses bins. */
  binId: string;
  /** The bin's code when posted, so history reads as it was after a bin rename. */
  binCode: string;
  priceListId: string;
  /** Net unit price per line unit, in the document currency. */
  unitPrice: number;
  discountPct: number;
  taxCode: string;
  packages: number;
  blanketAgreement: string;
  /** A different vendor for this line than the header's, if any. */
  lineVendorId: string;
  requisitionSlipNo: string;
  freeText: string;
  /** The PO and PO line this was copied from ('' for a line entered by hand). */
  baseId: string;
  baseLineId: string;
  /** The PO's number when copied, e.g. "Primary 260002", for display. */
  baseDocNo: string;
  /** PHP per inventory unit the stock came in at, fixed when the receipt is added. */
  unitCostLc: number;
  /** Billed so far on A/P invoices copied from this line, in the line's unit. */
  invoicedQty: number;
  /** Sent back on goods returns copied from this line (before it was billed). Missing = 0. */
  returnedQty?: number;
}

export interface GoodsReceipt {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  /** The vendor's delivery note or reference number. */
  vendorRef: string;
  currency: string;
  seriesId: string;
  /** 0 until added. */
  docNum: number;
  status: GrStatus;
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;

  // Contents
  lines: GrLine[];

  // Logistics
  shipTo: string;
  /** The vendor's address that its invoice and payment go to. */
  payTo: string;
  shippingType: string;
  language: string;

  // Accounting
  journalRemark: string;
  paymentTermId: string;
  paymentMethod: string;
  cashDiscountDays: number;
  projectId: string;
  indicator: string;
  /** The PO number(s) the lines were copied from; set by Copy from. */
  orderNumber: string;
  references: PoReference[];

  // Footer
  buyerId: string;
  ownerId: string;
  remarks: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  /** PHP per unit of the document currency, fixed when the receipt is added (1 for PHP). */
  fxRate: number;
}

export const GR_SERIES: DocumentSeries[] = [
  { id: 'grs-primary', name: 'Primary', prefix: '', firstNo: 1, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'GR' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];

/**
 * Allocation account: Goods Received Not Invoiced. A receipt credits it; the A/P invoice
 * will debit it and credit the vendor.
 */
export const GRNI_ACCOUNT = '2025';
/** Freight on a receipt is a purchase cost, not part of the stock value. */
export const FREIGHT_IN_ACCOUNT = '5040';

export const newGrLine = (patch: Partial<GrLine> = {}): GrLine => ({
  id: `gl-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  name: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  binId: '',
  binCode: '',
  priceListId: plId('Last purchase price'),
  unitPrice: 0,
  discountPct: 0,
  taxCode: '',
  packages: 0,
  blanketAgreement: '',
  lineVendorId: '',
  requisitionSlipNo: '',
  freeText: '',
  baseId: '',
  baseLineId: '',
  baseDocNo: '',
  unitCostLc: 0,
  invoicedQty: 0,
  ...patch,
});

export function blankGoodsReceipt(today: string, buyerId: string): Omit<GoodsReceipt, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: GR_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    dueDate: '',
    documentDate: today,
    closeDate: '',
    lines: [],
    shipTo: '',
    payTo: '',
    shippingType: '',
    language: 'English',
    journalRemark: '',
    paymentTermId: '',
    paymentMethod: '',
    cashDiscountDays: 0,
    projectId: '',
    indicator: '',
    orderNumber: '',
    references: [],
    buyerId: buyerId,
    ownerId: buyerId,
    remarks: '',
    discountPct: 0,
    freight: 0,
    freightTaxCode: '',
    fxRate: 1,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// One receipt for every PO with goods received, matching the PO lines' received quantities.
// They're history: the seeded item stock already reflects them.

const seedFx = (currency: string, date: string) =>
  currency === 'PHP'
    ? 1
    : ([...SEED_RATES].filter((d) => d.date <= date && d.rates[currency] > 0).sort((a, b) => b.date.localeCompare(a.date))[0]?.rates[currency] ?? 0);


const received = SEED_PURCHASE_ORDERS.filter((po) => po.status !== 'Cancelled' && po.lines.some((l) => l.receivedQty > 0)).map((po) => ({
  po,
  date: receiptDate(po),
}));

export const SEED_GOODS_RECEIPTS: GoodsReceipt[] = received
  .sort((a, b) => a.date.localeCompare(b.date))
  .map(({ po, date }, n): GoodsReceipt => {
    const fxRate = seedFx(po.currency, date);
    const poSeries = PO_SERIES.find((s) => s.id === po.seriesId);
    const poPrefix = poSeries?.segments?.[0]?.value ?? (poSeries?.name ?? 'PO');
    const poNo = po.docNum ? `${poPrefix}-${po.postingDate.slice(0, 4)}-${String(po.docNum).padStart(4, '0')}` : 'Draft';
    return {
      ...blankGoodsReceipt(date, po.buyerId),
      id: `gr-${String(n + 1).padStart(3, '0')}`,
      vendorId: po.vendorId,
      vendorCode: po.vendorCode,
      vendorName: po.vendorName,
      contactId: po.contactId,
      vendorRef: po.vendorRef ? `DR-${po.vendorRef.replace(/\D/g, '').slice(-6) || n + 1}` : '',
      currency: po.currency,
      docNum: 1 + n,
      // Receipts for finished POs have been invoiced; the rest still wait on the bill.
      status: po.status === 'Closed' ? 'Closed' : 'Open',
      closeDate: po.status === 'Closed' ? po.closeDate : '',
      dueDate: po.dueDate,
      shipTo: po.shipTo,
      shippingType: po.shippingType,
      journalRemark: `Goods Receipt PO – ${po.vendorCode}`,
      paymentTermId: po.paymentTermId,
      paymentMethod: po.paymentMethod,
      projectId: po.projectId,
      orderNumber: poNo,
      ownerId: po.ownerId,
      discountPct: po.discountPct,
      fxRate,
      lines: po.lines
        .filter((l) => l.receivedQty > 0)
        .map((l) => {
          const item = SEED_ITEMS.find((i) => i.id === l.itemId);
          return newGrLine({
            id: `gl-seed-${l.id}`,
            itemId: l.itemId,
            itemNo: l.itemNo,
            name: l.name,
            description: l.description,
            quantity: l.receivedQty,
            uomCode: l.uomCode,
            uomName: l.uomName,
            itemsPerUnit: l.itemsPerUnit,
            warehouse: l.warehouse,
            binId: item?.warehouses.find((w) => w.code === l.warehouse)?.defaultBinId ?? '',
            binCode: seedBinCode(item?.warehouses.find((w) => w.code === l.warehouse)?.defaultBinId ?? ''),
            priceListId: l.priceListId,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            taxCode: l.taxCode,
            blanketAgreement: l.blanketAgreement,
            requisitionSlipNo: l.requisitionSlipNo,
            freeText: l.freeText,
            baseId: po.id,
            baseLineId: l.id,
            baseDocNo: poNo,
            // What the goods came in at: the PO's net price, at the receipt's rate, per inventory unit.
            unitCostLc: Math.round(((l.unitPrice * (1 - l.discountPct / 100) * (1 - po.discountPct / 100) * fxRate) / (l.itemsPerUnit || 1)) * 10000) / 10000,
            // Receipts for finished POs have been billed in full (see the seeded A/P invoices).
            invoicedQty: po.status === 'Closed' ? l.receivedQty : 0,
          });
        }),
    };
  });
