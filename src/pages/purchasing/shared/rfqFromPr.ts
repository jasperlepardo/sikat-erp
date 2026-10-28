import { formatAddress } from '../../../mocks/address';
import type { ExchangeRate } from '../../../mocks/currencies';
import type { Item } from '../../../mocks/items';
import type { Warehouse } from '../../../mocks/itemMasters';
import type { Partner } from '../../../mocks/partners';
import type { PrLine, PurchaseRequest } from '../../../mocks/purchaseRequests';
import { blankRfq, newRfqLine, type Rfq } from '../../../mocks/rfqs';
import { rateOn } from '../../../services/masterData';
import { round2 } from '../../../services/num';
import { prNumber } from '../../../services/purchaseRequests';
import type { RfqInput } from '../../../services/rfqs';
import { itemVendorOptions } from './purchLineHelpers';

/** A vendor that accepts several currencies quotes in pesos. */
const ALL_CURRENCIES = 'All currencies';

/** What the items and vendors a request's routing reads. */
interface RoutingMasters {
  items: readonly Item[];
  vendors: readonly Partner[];
}

/** The header fields a quotation takes from its vendor: contact, currency, terms and pay-to address. */
export function rfqVendorDefaults(v: Partner): Partial<Rfq> {
  const billAddr = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
  return {
    vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId,
    currency: !v.currency || v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    paymentTermId: v.vendorPaymentTermId, paymentMethod: v.defaultPaymentMethod || 'BANK',
    shippingType: v.shippingType || '',
    journalRemark: `Purchase Quotations – ${v.code}`,
    payTo: billAddr ? formatAddress(billAddr, v.name) : '',
  };
}

/** The open lines of a request: not closed, with an item and something left to order. */
export const openPrLines = (pr: Pick<PurchaseRequest, 'lines'>) =>
  pr.lines.filter((l) => l.status === 'Open' && l.openQty > 0 && l.itemId);

/** The vendors that carry a line's item (its default vendor and vendor list), active ones only. */
export const lineVendorIds = (l: PrLine, m: RoutingMasters) =>
  itemVendorOptions(m.items.find((i) => i.id === l.itemId), m.vendors).map((o) => o.value);

/** Who a request is sent to when the buyer hasn't chosen: every vendor linked to some open line. */
const defaultCandidates = (pr: Pick<PurchaseRequest, 'lines'>, m: RoutingMasters) =>
  [...new Set(openPrLines(pr).flatMap((l) => lineVendorIds(l, m)))];

/** The request's candidate vendors: the stored set, else the lines' linked vendors. */
export const candidatesOf = (pr: Pick<PurchaseRequest, 'lines' | 'candidateVendorIds'>, m: RoutingMasters) =>
  pr.candidateVendorIds.length ? pr.candidateVendorIds : defaultCandidates(pr, m);

/** Routing default: the open request lines whose item the vendor carries. */
export const linesForVendor = (pr: Pick<PurchaseRequest, 'lines'>, vendorId: string, m: RoutingMasters) =>
  openPrLines(pr).filter((l) => lineVendorIds(l, m).includes(vendorId));

/** Active vendors as picker options, code over name, leaving out `exclude`. */
export const vendorOptions = (vendors: readonly Partner[], exclude: readonly string[] = []) =>
  vendors
    .filter((v) => v.status !== 'Inactive' && !exclude.includes(v.id))
    .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }));

/**
 * One vendor's quotation request from a purchase request: the vendor's header defaults, the
 * request's required date and freight, and `lines` (the routed subset for this vendor) at their
 * open quantity. Valid until stays blank: it's when the vendor's prices expire, entered from their
 * reply, not the request's own validity. Reference prices convert to the vendor's currency at the
 * posting date's rate.
 */
export function rfqDraftFromPr(
  pr: PurchaseRequest,
  vendor: Partner,
  lines: PrLine[],
  { ownerId, today, approved, rates, warehouses }: {
    ownerId: string;
    today: string;
    approved: boolean;
    rates: readonly ExchangeRate[];
    warehouses: readonly Warehouse[];
  },
): RfqInput {
  const header = rfqVendorDefaults(vendor);
  const currency = header.currency ?? 'PHP';
  const fx = currency === 'PHP' ? 1 : (rateOn([...rates], currency, today)?.rate ?? 0);
  const wh = warehouses.find((w) => w.code === lines.find((l) => l.warehouse)?.warehouse);
  const no = prNumber(pr);
  return {
    ...blankRfq(ownerId),
    ...header,
    approved,
    postingDate: today,
    documentDate: today,
    requiredDate: pr.requiredDate,
    freight: currency === 'PHP' ? pr.freight : 0,
    shipTo: wh ? formatAddress(wh.address, wh.name) : '',
    basePrId: pr.id,
    lines: lines.map((l) =>
      newRfqLine({
        itemId: l.itemId, itemNo: l.itemNo, description: l.description,
        requiredDate: l.requiredDate, quantity: l.openQty,
        uomCode: l.uomCode, uomName: l.uomName, itemsPerUnit: l.itemsPerUnit,
        priceListId: l.priceListId, unitPrice: fx ? round2(l.unitPrice / fx) : 0, discountPct: l.discountPct,
        taxCode: l.taxCode, requisitionSlipNo: l.requisitionSlipNo,
        countryOfOriginCode: l.countryOfOriginCode, warrantyTemplateId: l.warrantyTemplateId, glAccount: l.glAccount,
        baseId: pr.id, baseLineId: l.id, baseDocNo: no,
      }),
    ),
    remarks: `From purchase request ${no}.${pr.remarks ? ` ${pr.remarks}` : ''}`,
  };
}
