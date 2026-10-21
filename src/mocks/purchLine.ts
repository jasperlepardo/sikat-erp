/**
 * The unified purchasing line shape for the forward flow (PR / RFQ / PO / GRPO).
 *
 * Goal: one line model where **every field is available on every document**, so the
 * single `<PurchLinesTable>` can render any column and each document just chooses
 * which to show. The core fields are required (present on all four with the same
 * name, after the description/unitPrice/vendor/quantity naming was unified); every
 * document-specific field is **optional**, so it's available everywhere and populated
 * where it applies.
 *
 * Each concrete line type (`PrLine`, `RfqLine`, `PoLine`, `GrLine`) `extends PurchLine`
 * and re-declares the document-specific fields it guarantees as required. See
 * `docs/purchasing-lines-table-unification.md`.
 */
export interface PurchLine {
  // ── Core: present, same-named, on all four forward line types. ──
  id: string;
  itemId: string;
  itemNo: string;
  /** Defaults from the item; editable per line without writing back to the item. */
  description: string;
  /** In the purchasing/line unit. (PR: requested · PO: ordered · GR: received). */
  quantity: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one purchasing unit. */
  itemsPerUnit: number;
  /** Net unit price in the document currency (PR shows this as the info price). */
  unitPrice: number;
  discountPct: number;
  taxCode: string;
  priceListId: string;
  /** Linked requisition reference — traceability only. */
  requisitionSlipNo: string;

  // ── Document-specific: optional so every field is available on every document
  //    and populated where it applies. Comment marks which docs use each today. ──
  /** Item name snapshot. PO, GR. */
  name?: string;
  /** Line-level preferred/override vendor (BP id). '' = header vendor. PR, RFQ, GR. */
  lineVendorId?: string;
  /** Date the line is needed. PR, RFQ. */
  requiredDate?: string;
  /** Date the vendor quoted. RFQ. */
  quotedDate?: string;
  /** Row-level delivery date. PO. */
  deliveryDate?: string;
  /** Vendor's quoted quantity. RFQ. */
  quotedQty?: number;
  /** Quantity not yet converted to a PO/quotation. PR. */
  openQty?: number;
  /** Received on goods receipts so far. PO. */
  receivedQty?: number;
  /** Warehouse the stock moves in/out of. PR, PO, GR. */
  warehouse?: string;
  /** Put-away bin + its code snapshot. GR. */
  binId?: string;
  binCode?: string;
  /** Number of packages received. GR. */
  packages?: number;
  /** Vendor's own catalog number. PO. */
  bpCatalogNo?: string;
  /** Manufacturer part number. PO. */
  mfrNo?: string;
  /** Free-text line note. PR, PO, GR. */
  freeText?: string;
  /** Department the line's cost is charged to. PR, PO. */
  departmentId?: string;
  /** Linked blanket agreement no. RFQ, PO, GR. */
  blanketAgreement?: string;
  /** Per-line open/closed status. PR, PO. */
  status?: 'Open' | 'Closed';
  /** Return reason code (credit/return docs; conditional, unused at request/order stage). */
  returnReason?: string;
  /** Blanket-agreement record + line this draws against. PO. */
  agreementId?: string;
  agreementLineId?: string;
  /** Copied-from document + line + display number. GR. */
  baseId?: string;
  baseLineId?: string;
  baseDocNo?: string;
  /** PHP per inventory unit the stock came in at, fixed on receipt. GR. */
  unitCostLc?: number;
  /** Billed so far on A/P invoices copied from this line. GR. */
  invoicedQty?: number;
  /** Sent back on goods returns copied from this line. GR. */
  returnedQty?: number;
}

/**
 * The minimal constraint the shared table and column builders need: a stable row id
 * and the item foreign key (columns render nothing until an item is picked).
 */
export type PurchLineBase = { id: string; itemId: string };
