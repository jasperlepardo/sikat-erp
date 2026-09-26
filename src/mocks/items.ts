export type ItemStatus = 'Active' | 'Inactive';

export interface Item {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  onHand: number;
  reorderLevel: number;
  unitPrice: number;
  status: ItemStatus;
  description?: string;
}

export const ITEM_CATEGORIES = ['Fasteners', 'Electrical', 'Plumbing', 'Hardware', 'Paint'] as const;
export const ITEM_UOMS = ['pc', 'box', 'roll', 'm', 'kg', 'L'] as const;

/** Seed data — edits made in the UI are persisted to localStorage on top of this. */
export const SEED_ITEMS: Item[] = [
  { id: 'itm-001', sku: 'FST-BLT-0612', name: 'Hex bolt M6 × 12mm', category: 'Fasteners', uom: 'box', onHand: 140, reorderLevel: 50, unitPrice: 185, status: 'Active' },
  { id: 'itm-002', sku: 'FST-NUT-0600', name: 'Hex nut M6', category: 'Fasteners', uom: 'box', onHand: 32, reorderLevel: 50, unitPrice: 95, status: 'Active' },
  { id: 'itm-003', sku: 'ELC-WIR-1425', name: 'THHN wire 14 AWG', category: 'Electrical', uom: 'roll', onHand: 18, reorderLevel: 10, unitPrice: 2450, status: 'Active' },
  { id: 'itm-004', sku: 'ELC-BRK-2030', name: 'Circuit breaker 30A', category: 'Electrical', uom: 'pc', onHand: 6, reorderLevel: 12, unitPrice: 540, status: 'Active' },
  { id: 'itm-005', sku: 'PLB-PVC-0050', name: 'PVC pipe ½"', category: 'Plumbing', uom: 'm', onHand: 420, reorderLevel: 100, unitPrice: 48, status: 'Active' },
  { id: 'itm-006', sku: 'PLB-ELB-0050', name: 'PVC elbow ½"', category: 'Plumbing', uom: 'pc', onHand: 0, reorderLevel: 40, unitPrice: 12, status: 'Active' },
  { id: 'itm-007', sku: 'HRD-HNG-0304', name: 'Butt hinge 3" × 4"', category: 'Hardware', uom: 'pc', onHand: 75, reorderLevel: 30, unitPrice: 65, status: 'Active' },
  { id: 'itm-008', sku: 'HRD-LCK-0100', name: 'Cylindrical lockset', category: 'Hardware', uom: 'pc', onHand: 14, reorderLevel: 10, unitPrice: 890, status: 'Active' },
  { id: 'itm-009', sku: 'PNT-LTX-WHT4', name: 'Latex paint, white 4L', category: 'Paint', uom: 'L', onHand: 22, reorderLevel: 15, unitPrice: 720, status: 'Active' },
  { id: 'itm-010', sku: 'PNT-PRM-GRY4', name: 'Metal primer, grey 4L', category: 'Paint', uom: 'L', onHand: 9, reorderLevel: 10, unitPrice: 680, status: 'Active' },
  { id: 'itm-011', sku: 'FST-SCR-0425', name: 'Wood screw #8 × 1"', category: 'Fasteners', uom: 'box', onHand: 210, reorderLevel: 60, unitPrice: 150, status: 'Active' },
  { id: 'itm-012', sku: 'ELC-OUT-0002', name: 'Duplex outlet', category: 'Electrical', uom: 'pc', onHand: 55, reorderLevel: 25, unitPrice: 120, status: 'Inactive' },
  { id: 'itm-013', sku: 'PLB-TAP-0001', name: 'Teflon tape', category: 'Plumbing', uom: 'roll', onHand: 300, reorderLevel: 80, unitPrice: 18, status: 'Active' },
  { id: 'itm-014', sku: 'HRD-NAI-0203', name: 'Common nail 2"', category: 'Hardware', uom: 'kg', onHand: 44, reorderLevel: 20, unitPrice: 95, status: 'Active' },
  { id: 'itm-015', sku: 'PNT-BRS-0003', name: 'Paint brush 3"', category: 'Paint', uom: 'pc', onHand: 3, reorderLevel: 20, unitPrice: 85, status: 'Inactive' },
];
