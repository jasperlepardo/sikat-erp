import type { Vis } from '../../../components/form/docLines/pick';

/**
 * The purchase quotation's line columns, in order, with their default visibility. Shared by the
 * quotation's Contents table and a purchase request's quote comparison, so both read the same.
 */
export const RFQ_LINE_LAYOUT: [string, Vis][] = [
  // Shown by default: the SAP B1 v10 Contents fields, in its order, and what's been ordered from it.
  ['type', 'opt'], ['vendor', 'opt'], ['requiredDate', 'opt'], ['qty', 'always'], ['orderedQty', 'opt'], ['unitPrice', 'always'],
  ['discount', 'opt'], ['tax', 'opt'], ['total', 'always'], ['glAccount', 'opt'], ['countryOfOrigin', 'opt'],
  ['warranty', 'opt'], ['unitCost', 'opt'],
  // Everything else, in the column chooser.
  ['quotedQty', 'hide'], ['openQty', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryQty', 'hide'],
  ['priceList', 'hide'], ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['reverseChargeVat', 'hide'], ['gross', 'hide'],
  ['grossTotalLc', 'hide'], ['quotedDate', 'hide'], ['warehouse', 'hide'], ['department', 'hide'], ['freeText', 'hide'],
  ['blanket', 'hide'], ['requisition', 'hide'], ['bpCatalogNo', 'hide'], ['mfrNo', 'hide'], ['deliveryDate', 'hide'],
  ['receivedQty', 'hide'], ['packages', 'hide'], ['lineStatus', 'hide'],
];
