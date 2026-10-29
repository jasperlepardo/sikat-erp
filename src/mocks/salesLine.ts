/**
 * The unified sales line shape across the forward flow (Sales Quotation / Sales Order /
 * Delivery / A/R Invoice / Sales Return / A/R Credit Memo), mirroring `PurchLine` on
 * the purchasing side.
 *
 * Goal: one line model where **every field is available on every document**, so the
 * shared `salesCols` registry can render any column and each document just chooses
 * which to show. The core fields are required (present on all sales lines with the same
 * name); every document-specific or catalog field is **optional**, so it's available
 * everywhere and populated where it applies.
 *
 * Each concrete line type (`QuoteLine`, `SoLine`, `DnLine`, `ArLine`, `SrLine`,
 * `ArCmLine`) extends this and re-declares the fields it guarantees as required
 * (e.g. a delivery line always has `baseType`, a sales-order line always has
 * `deliveredQty`). This is the sales sibling of `docs/purchasing-lines-table-unification.md`.
 */
export interface SalesLine {
  // ── Core: present, same-named, on every sales line. ──
  id: string;
  itemId: string;
  itemNo: string;
  /** Defaults from the item; editing it here doesn't change the item. */
  description: string;
  /** In the line's (sales) unit. */
  quantity: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one line unit. */
  itemsPerUnit: number;
  warehouse: string;
  priceListId: string;
  /** Net of VAT, per line unit, in the document currency. */
  unitPrice: number;
  discountPct: number;
  /** What set the price: "Special price", "Discount group …", the list name, or "Manual". */
  priceSource: string;
  taxCode: string;
  /** User edited the tax code by hand: auto-recalc leaves this line alone. Missing = false. */
  taxOverridden?: boolean;

  // ── Fulfilment / posting — optional on the base, required where the doc guarantees it. ──
  /** Service lines: the revenue account the line posts to (required on quotations, orders, invoices). */
  glAccount?: string;
  /** Delivered so far, in the sales unit. Sales order. */
  deliveredQty?: number;
  /** Per-line open/closed status. Sales order. */
  status?: string;
  /** Blanket agreement this line is drawn against, and the specific BA line. Sales order. */
  agreementId?: string;
  agreementLineId?: string;
  /** The tax code's ATC and BIR return, stamped when a posting document is added. */
  taxAtc?: string;
  taxReturn?: string;
  /** The document and line this was copied from. Delivery / invoice / return / credit memo. */
  baseType?: string;
  baseId?: string;
  baseLineId?: string;
  baseDocNo?: string;
  baseRow?: number;
  /** PHP per inventory unit the stock moved at, fixed when the document is added. */
  unitCostLc?: number;
  /** Billed so far on A/R invoices, in the line's unit. Delivery. */
  invoicedQty?: number;
  /** From a delivery that used the shipped goods account. A/R invoice. */
  shippedGoods?: boolean;
  /** Subject to the customer's withholding. A/R invoice. */
  wtaxLiable?: boolean;
  /** Sales commission % for this line. A/R invoice. */
  commissionPct?: number;
  /** Return reason code. Sales return / credit memo. */
  returnReason?: string;
  /** Quantity already copied to an A/R credit memo. Sales return. */
  creditedQty?: number;
  /** Put the goods back in inventory. Credit memo. */
  returnGoods?: boolean;
  /** The A/R invoice this line credits. Credit memo. */
  invoiceId?: string;

  // ── SAP B1 "Contents" catalog / printout / withholding fields (opt-in columns). ──
  /** Country/region of origin — defaults from the item. */
  countryOfOriginCode?: string;
  /** Warranty template (id) — defaults from the item. */
  warrantyTemplateId?: string;
  serialNo?: string;
  /** Free-text blanket agreement number (display only; `agreementId` is the real link). */
  blanketAgreementNo?: string;
  /** Cost-accounting distribution rule (dimension). */
  distrRule?: string;
  /** COGS distribution rule (dimension). */
  cogsDistrRule?: string;
  allowProcurementDoc?: boolean;
  /** Whether the line's amount prints on the customer document. */
  amountInPrintout?: boolean;
  /** Line description as it reads for the customer (printout). */
  customerDescription?: string;
  /** Unit cost price (LC). */
  unitCost?: number;
  /** Last cost (LC). */
  lastCost?: number;

  // ── SAP B1 internal withholding / reporting plumbing. ──
  wWTCode?: string;
  wVTVendor?: string;
  wTaxDefined?: string;
  wtaxRate?: number;
  priceForReport?: number;

  // ── Printout snapshot (x*) fields. ──
  xSupplierName?: string;
  xAddress?: string;
  xTINumber?: string;
  xCardType?: string;
}
