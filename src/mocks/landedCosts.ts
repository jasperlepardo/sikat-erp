import type { Attachment, DocumentSeries } from './common';

export type LcStatus = 'Draft' | 'Open' | 'Cancelled';
export const LC_STATUSES: LcStatus[] = ['Draft', 'Open', 'Cancelled'];

export const LC_SERIES: DocumentSeries[] = [
  {
    id: 'lcs-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [{ type: 'literal', value: 'LC' }, { type: 'year' }, { type: 'sequence', padding: 5 }],
  },
];

export interface LandedCostLine {
  id: string;
  baseType: 'GRPO';
  baseId: string;
  baseLineId: string;
  baseDocNo: string;
  itemId: string;
  itemNo: string;
  description: string;
  quantity: number;
  uomCode: string;
  warehouse: string;
  unitPrice: number;
  releaseNo: string;
  projectedCustoms: number;
  customsValue: number;
  expenditure: number;
  allocCostsVal: number;
  varCosts: number;
  constCosts: number;
}

export interface LandedCostEntry {
  id: string;
  landedCostTypeId: string;
  allocationBy: 'Quantity' | 'Value' | 'Equal';
  amount: number;
  includeForCustoms: boolean;
  isVariable: boolean;
}

export interface LandedCostVendor {
  id: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
}

export interface LandedCost {
  id: string;
  docNum: number;
  seriesId: string;
  status: LcStatus;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  brokerId: string;
  brokerCode: string;
  brokerName: string;
  currency: string;
  postingDate: string;
  dueDate: string;
  reference: string;
  fileNo: string;
  journalRemark: string;
  lines: LandedCostLine[];
  costs: LandedCostEntry[];
  vendors: LandedCostVendor[];
  actualCustoms: number;
  customsDate: string;
  customsAffectsInventory: boolean;
  remarks: string;
  transactionId: string;
  attachments: Attachment[];
}

export function blankLandedCost(today: string): Omit<LandedCost, 'id'> {
  return {
    docNum: 0,
    seriesId: LC_SERIES[0].id,
    status: 'Draft',
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    brokerId: '',
    brokerCode: '',
    brokerName: '',
    currency: 'PHP',
    postingDate: today,
    dueDate: today,
    reference: '',
    fileNo: '',
    journalRemark: '',
    lines: [],
    costs: [],
    vendors: [],
    actualCustoms: 0,
    customsDate: '',
    customsAffectsInventory: false,
    remarks: '',
    transactionId: '',
    attachments: [],
  };
}

export const SEED_LANDED_COSTS: LandedCost[] = [
  {
    id: 'lc-001',
    docNum: 1,
    seriesId: LC_SERIES[0].id,
    status: 'Open',
    vendorId: 'bp-017',
    vendorCode: 'BP-0017',
    vendorName: 'Apple South Asia Pte. Ltd.',
    brokerId: '',
    brokerCode: '',
    brokerName: '',
    currency: 'USD',
    postingDate: '2026-01-28',
    dueDate: '2026-01-28',
    reference: 'AWB-2026-01-SIN',
    fileNo: 'BOC-2026-0124',
    journalRemark: 'Landed Costs – BP-0017',
    customsAffectsInventory: true,
    actualCustoms: 0,
    customsDate: '2026-01-28',
    remarks: 'January iPad shipment from Singapore. Air freight via Singapore Airlines Cargo.',
    transactionId: '',
    attachments: [],
    vendors: [],
    costs: [
      { id: 'lce-001-1', landedCostTypeId: 'lct-001', allocationBy: 'Value', amount: 2500, includeForCustoms: true, isVariable: false },
      { id: 'lce-001-2', landedCostTypeId: 'lct-002', allocationBy: 'Value', amount: 1800, includeForCustoms: false, isVariable: false },
      { id: 'lce-001-3', landedCostTypeId: 'lct-003', allocationBy: 'Equal', amount: 450, includeForCustoms: false, isVariable: false },
    ],
    lines: [
      {
        id: 'lcl-001-1', baseType: 'GRPO', baseId: 'gr-006', baseLineId: 'gl-seed-po-r2601-017-6', baseDocNo: 'GR-2026-0006',
        itemId: 'apl-0216', itemNo: 'IPD-A16-128-WF-PNK', description: 'iPad (A16), 128GB, Wi-Fi, Pink',
        quantity: 48, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 379.17,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 1417.34, constCosts: 1417.34, varCosts: 0,
      },
      {
        id: 'lcl-001-2', baseType: 'GRPO', baseId: 'gr-006', baseLineId: 'gl-seed-po-r2601-017-109', baseDocNo: 'GR-2026-0006',
        itemId: 'apl-0094', itemNo: 'IPD-PRO-11-1T-NT-CL-SLV', description: 'iPad Pro (M5), 11-inch, 1TB, Nano-texture glass, Wi-Fi + Cellular, Silver',
        quantity: 7, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 2031.88,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 1132.20, constCosts: 1132.20, varCosts: 0,
      },
      {
        id: 'lcl-001-3', baseType: 'GRPO', baseId: 'gr-006', baseLineId: 'gl-seed-po-r2601-017-123', baseDocNo: 'GR-2026-0006',
        itemId: 'apl-0098', itemNo: 'IPD-PRO-11-2T-SG-CL-SLV', description: 'iPad Pro (M5), 11-inch, 2TB, Standard glass, Wi-Fi + Cellular, Silver',
        quantity: 6, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 2357,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 1126.40, constCosts: 1126.40, varCosts: 0,
      },
      {
        id: 'lcl-001-4', baseType: 'GRPO', baseId: 'gr-006', baseLineId: 'gl-seed-po-r2601-017-144', baseDocNo: 'GR-2026-0006',
        itemId: 'apl-0121', itemNo: 'IPD-PRO-13-2T-SG-CL-SBK', description: 'iPad Pro (M5), 13-inch, 2TB, Standard glass, Wi-Fi + Cellular, Space Black',
        quantity: 5, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 2682.14,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 1074.03, constCosts: 1074.03, varCosts: 0,
      },
    ],
  },
  {
    id: 'lc-002',
    docNum: 2,
    seriesId: LC_SERIES[0].id,
    status: 'Open',
    vendorId: 'bp-017',
    vendorCode: 'BP-0017',
    vendorName: 'Apple South Asia Pte. Ltd.',
    brokerId: '',
    brokerCode: '',
    brokerName: '',
    currency: 'USD',
    postingDate: '2026-02-28',
    dueDate: '2026-02-28',
    reference: 'AWB-2026-02-SIN',
    fileNo: 'BOC-2026-0228',
    journalRemark: 'Landed Costs – BP-0017',
    customsAffectsInventory: true,
    actualCustoms: 0,
    customsDate: '2026-02-28',
    remarks: 'February iPad Pro shipment from Singapore.',
    transactionId: '',
    attachments: [],
    vendors: [],
    costs: [
      { id: 'lce-002-1', landedCostTypeId: 'lct-001', allocationBy: 'Value', amount: 2200, includeForCustoms: true, isVariable: false },
      { id: 'lce-002-2', landedCostTypeId: 'lct-002', allocationBy: 'Value', amount: 1500, includeForCustoms: false, isVariable: false },
    ],
    lines: [
      {
        id: 'lcl-002-1', baseType: 'GRPO', baseId: 'gr-018', baseLineId: 'gl-seed-po-r2602-017-106', baseDocNo: 'GR-2026-0018',
        itemId: 'apl-0093', itemNo: 'IPD-PRO-11-1T-NT-CL-SBK', description: 'iPad Pro (M5), 11-inch, 1TB, Nano-texture glass, Wi-Fi + Cellular, Space Black',
        quantity: 5, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 2031.88,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 914.64, constCosts: 914.64, varCosts: 0,
      },
      {
        id: 'lcl-002-2', baseType: 'GRPO', baseId: 'gr-018', baseLineId: 'gl-seed-po-r2602-017-107', baseDocNo: 'GR-2026-0018',
        itemId: 'apl-0094', itemNo: 'IPD-PRO-11-1T-NT-CL-SLV', description: 'iPad Pro (M5), 11-inch, 1TB, Nano-texture glass, Wi-Fi + Cellular, Silver',
        quantity: 5, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 2031.88,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 914.64, constCosts: 914.64, varCosts: 0,
      },
      {
        id: 'lcl-002-3', baseType: 'GRPO', baseId: 'gr-018', baseLineId: 'gl-seed-po-r2602-017-108', baseDocNo: 'GR-2026-0018',
        itemId: 'apl-0092', itemNo: 'IPD-PRO-11-1T-NT-WF-SLV', description: 'iPad Pro (M5), 11-inch, 1TB, Nano-texture glass, Wi-Fi, Silver',
        quantity: 4, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 1828.69,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 658.53, constCosts: 658.53, varCosts: 0,
      },
      {
        id: 'lcl-002-4', baseType: 'GRPO', baseId: 'gr-018', baseLineId: 'gl-seed-po-r2602-017-109', baseDocNo: 'GR-2026-0018',
        itemId: 'apl-0089', itemNo: 'IPD-PRO-11-1T-SG-CL-SBK', description: 'iPad Pro (M5), 11-inch, 1TB, Standard glass, Wi-Fi + Cellular, Space Black',
        quantity: 7, uomCode: 'pc', warehouse: 'WH-MNL', unitPrice: 1923.52,
        releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0,
        allocCostsVal: 1212.16, constCosts: 1212.16, varCosts: 0,
      },
    ],
  },
];
