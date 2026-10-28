import type { PrefColumn } from '../../../../../components/form/columnPrefs';
import type { Rfq, RfqLine } from '../../../../../mocks/rfqs';
import { rateAt, vatNotPaidToVendor } from '../../../../../mocks/taxes';
import { round2 } from '../../../../../services/num';
import { lineNet } from '../../../../../services/rfqs';
import { taxCodeOptions } from '../../../../../services/taxCodeOptions';
import { countryDef, departmentDef, priceListDef, warrantyTemplateDef } from '../../../../settings/masterDefs';
import { purchCols, pick } from '../../../shared/purchCols';
import { RFQ_LINE_LAYOUT } from '../../../shared/rfqLineLayout';
import { costAccountOptions, lineGlAccount, lineHelpers } from '../../../shared/purchLineHelpers';
import type { PrMasters } from '../types';

/**
 * Stands in for the currency in the registry's amount headers ("Total (USD)"): the comparison shows
 * every quote in the currency picked on its toggle, so the header takes that one, not the quote's.
 */
const EACH = '\u0000';
const noop = () => {};

/** The purchase quotation's line columns (the registry `rfqDoc` uses), read-only, bound to one quotation. */
export function quoteLineCols(rfq: Rfq, m: PrMasters): Record<string, PrefColumn<RfqLine>> {
  const codeOf = (code: string) => m.tax.codes.find((c) => c.code === code);
  const rateOf = (code: string) => { const c = codeOf(code); return c ? (rateAt(c, rfq.postingDate) ?? 0) : 0; };
  const isReverseCharge = (code: string) => vatNotPaidToVendor(codeOf(code));
  const h = lineHelpers<RfqLine>({ items: m.items, lines: rfq.lines, update: noop, errors: {}, postingDate: rfq.postingDate, uoms: m.inv.uoms });
  const priceAfterDisc = (l: RfqLine) => l.unitPrice * (1 - l.discountPct / 100);
  const taxRate = (l: RfqLine) => (isReverseCharge(l.taxCode) ? 0 : rateOf(l.taxCode));
  return purchCols<RfqLine>({
    patch: noop, readOnly: true, currency: EACH, qtyHeader: 'Required qty', priceHeader: 'Info price',
    glAccountOf: (l) => lineGlAccount(h.itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet, priceAfterDisc,
    grossAfterDisc: (l) => priceAfterDisc(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    reverseChargeVat: (l) => (isReverseCharge(l.taxCode) ? round2((lineNet(l) * rateOf(l.taxCode)) / 100) : null),
    taxOptions: (l) => taxCodeOptions(m.tax.codes, 'Purchase', l.taxCode),
    vendorOptions: [], warehouseOptions: [],
    vendorOf: (l) => m.vendors.find((v) => v.id === (l.lineVendorId || rfq.vendorId)),
    uomOptions: h.uomOptions, uomLabel: h.uomLabel,
    priceListDef, departmentDef, countryDef, warrantyDef: warrantyTemplateDef,
    changeUom: noop, changePriceList: noop, onQty: noop,
    copiedQty: () => 0,
    invalid: () => false,
    lineKind: h.lineKind,
    itemWarranty: (l) => h.itemOf(l)?.warrantyTemplate ?? '',
    unitCost: (l) => h.itemOf(l)?.itemCost ?? 0,
  });
}

/**
 * The comparison's line columns: the quotation's Contents layout, in its order and default
 * visibility, with amount headers naming `currency` (the one every quote is shown in). `own` replaces a registry column
 * with the comparison's own (price, quantities and total), keeping the layout's visibility.
 */
export function layoutQuoteCols<R>(
  names: Record<string, PrefColumn<RfqLine>>,
  cellOf: (c: PrefColumn<RfqLine>, name: string) => PrefColumn<R>['cell'],
  own: Record<string, PrefColumn<R>>,
  currency: string,
): PrefColumn<R>[] {
  return pick(names, RFQ_LINE_LAYOUT).map((c, i): PrefColumn<R> => {
    const name = RFQ_LINE_LAYOUT[i][0];
    if (own[name]) return { optional: c.optional, defaultHidden: c.defaultHidden, ...own[name] };
    const header = typeof c.header === 'string' ? c.header.replace(EACH, currency) : c.header;
    return { ...(c as unknown as PrefColumn<R>), header, cell: cellOf(c, name) };
  });
}
