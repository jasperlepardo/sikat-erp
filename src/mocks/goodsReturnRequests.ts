/**
 * Goods Return Requests (Purchasing › Returns). An internal pre-return document —
 * like a Purchase Request is the pre-approval stage before a Purchase Order, a
 * Goods Return Request is the pre-approval stage before an actual Goods Return.
 * No stock movement or GL posting occurs until the request is converted to a return.
 */
import type { Attachment, DocumentSeries } from './common';
import type { PurchLine } from './purchLine';
import { RETURN_REASONS } from './goodsReturns';

export type GrrStatus = 'Open' | 'Closed';
export const GRR_STATUSES: GrrStatus[] = ['Open', 'Closed'];

/** @public */
export type GrrBaseType = 'GRPO' | 'APINV' | '';

export interface GrrLine extends PurchLine {
  /** Quantity not yet converted to an actual Goods Return. */
  openQty: number;
  /** Reason for returning the goods. */
  returnReason: string;
  countryOfOriginCode: string;
  /** Optional source doc: which receipt or invoice the goods originally came from. */
  baseType: GrrBaseType;
  status: 'Open' | 'Closed';
}

export interface GoodsReturnRequest {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  vendorRef: string;
  currency: string;
  seriesId: string;
  docNum: number;
  status: GrrStatus;

  postingDate: string;
  documentDate: string;
  requiredDate: string;
  closeDate: string;

  // Contents
  lines: GrrLine[];

  // Footer
  ownerId: string;
  remarks: string;
  attachments: Attachment[];
}

export const GRR_SERIES: DocumentSeries[] = [
  {
    id: 'grr-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'GRR' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export const newGrrLine = (patch: Partial<GrrLine> = {}): GrrLine => ({
  id: `grl-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  openQty: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  unitPrice: 0,
  discountPct: 0,
  taxCode: '',
  priceListId: '',
  requisitionSlipNo: '',
  returnReason: '',
  countryOfOriginCode: '',
  baseType: '',
  status: 'Open',
  ...patch,
});

export function blankGoodsReturnRequest(today: string, buyerId: string): Omit<GoodsReturnRequest, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: GRR_SERIES[0].id,
    docNum: 0,
    status: 'Open',
    postingDate: today,
    documentDate: today,
    requiredDate: '',
    closeDate: '',
    lines: [],
    ownerId: buyerId,
    remarks: '',
    attachments: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

export const SEED_GOODS_RETURN_REQUESTS: Omit<GoodsReturnRequest, 'id'>[] = [
  {
    vendorId: 'bp-017',
    vendorCode: 'ASI-001',
    vendorName: 'Acumen Systems Inc.',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: 'grr-primary',
    docNum: 1,
    status: 'Open',
    postingDate: '2026-08-15',
    documentDate: '2026-08-15',
    requiredDate: '2026-08-22',
    closeDate: '',
    lines: [
      newGrrLine({
        id: 'grl-seed-001',
        itemId: 'itm-mac-mini-m4',
        itemNo: 'MPCX4LL/A',
        description: 'Mac mini (M4, Late 2025) — defective unit',
        quantity: 1,
        openQty: 1,
        uomCode: 'pc',
        uomName: 'Piece',
        itemsPerUnit: 1,
        unitPrice: 42000,
        discountPct: 0,
        taxCode: 'SVAT',
        returnReason: RETURN_REASONS[0],
        countryOfOriginCode: 'CN',
        warehouse: 'WH-MAIN',
        baseType: '',
        status: 'Open',
      }),
    ],
    ownerId: '',
    remarks: 'Unit arrived with a cracked casing. Requesting return and replacement.',
    attachments: [],
  },
];
