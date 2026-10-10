/**
 * Store retail history: vendor returns only. The walk-in sales and store restock transfers that
 * previously lived here have been removed (B2B ERP; retail belongs in a POS).
 */

/**
 * Units sent back to the vendor after the bill (built in services/purchasingHistory.ts with their
 * credit memos). They stay in Pasig until they go back, so the stores get the rest.
 */
export const RETAIL_RETURNS = [
  { id: 'rt-003', docNum: 3, poId: 'po-048', itemNo: 'ACC-PWR35D', quantity: 2, date: '2026-08-01', reason: 'Defective', vendorRef: 'RMA-TZ-2608-007', memoNo: 3, memoRef: 'CN-TZ-2608-011', remarks: 'Two units dead out of the box; Techzone authorized the return.' },
  { id: 'rt-004', docNum: 4, poId: 'po-051', itemNo: 'ACC-PWR20', quantity: 3, date: '2026-08-21', reason: 'Damaged in transit', vendorRef: 'RMA-TZ-2608-019', memoNo: 4, memoRef: 'CN-TZ-2608-024', remarks: 'Carton crushed in transit; three units with cracked casings.' },
] as const;
