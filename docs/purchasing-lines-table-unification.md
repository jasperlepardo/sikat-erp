# Unify purchasing document lines into one table

## Goal

Merge the purchasing contents tables — **Purchase Request** (`PrLinesCard`), **Purchase
Quotation / RFQ** (`RfqLinesCard`), **Purchase Order** (`PoLinesCard`), **Goods Receipt PO /
GRPO** (`GrContentsCard`), **Goods Return** (`ReturnLines`), and **A/P Down Payment Invoice**
(`DprLinesCard`) — into a **single shared component**. No Item/Service grid switch — one merged
column universe, with per-document and per-line-type columns hidden via the existing
`useColumnPrefs` engine.

> **Two document classes.** PR → RFQ → PO → GRPO are the **forward flow** and share a tight
> core. **Goods Return** and **A/P Down Payment Invoice** are **credit / financial-adjustment**
> docs: their lines chain off the GRPO line and add a cluster (country of origin, warranty,
> serial, unit cost, **withholding tax**, BIR print UDFs) that also appears on A/P Credit Memo &
> A/P Reserve Invoice — not on the forward flow. Design the shared table with that cluster as an
> **opt-in capability**.

> **Richest current implementation = the PO.** `PoLinesCard` already covers almost the entire
> PO spec (Price Mode header, BP Catalog No., Mfr No., Del. Date, Gross Total (LC), Row status,
> Inventory-UoM flag, Qty-in-inventory-UoM). PR is richest for stock/requisition columns; GR
> adds bin allocation, packages, base-document link, and the only rendered line-Vendor column.
> Together **PO + PR cover ~95% of the merged universe**; RFQ adds quoted qty/date, GR adds
> receiving columns. Use **PO as the base template** for the shared pricing/qty columns.

## Verdict

The two tables share the same skeleton (item → qty+UoM → price → discount → tax → total,
plus price list / requisition / preferred vendor / required date) — roughly **70% identical**.
They diverge in three structural ways:

1. **Field names** — three fields differ (`itemDescription`/`description`, `vendorId`/`lineVendorId`, `infoPrice`/`unitPrice`).
2. **Currency model** — PR is PHP-only; RFQ is multi-currency with an FX footer and dual amounts.
3. **Column granularity** — PR uses granular columns; RFQ combines price/tax/discount into one cell.

Unification is very achievable but needs an adapter layer — one component cannot point at
both line types as-is.

---

## 1. Data model — same concepts, different names

| Concept | `PrLine` | `RfqLine` | `PoLine` | `GrLine` / `ReturnLine` |
|---|---|---|---|---|
| Description | `itemDescription` | `description` | `description` (+ `name`) | `description` (+ `name`) |
| Preferred / line vendor | `vendorId` | `lineVendorId` | — (header vendor only) | `lineVendorId` |
| Price | `infoPrice` | `unitPrice` | `unitPrice` | `unitPrice` |
| Line date | `requiredDate` | `requiredDate`, `quotedDate` | `deliveryDate` | — |
| Item ref / `uomCode` / `uomName` / `itemsPerUnit` / `discountPct` / `taxCode` / `priceListId` / `requisitionSlipNo` | identical names | identical names | identical names | identical names |
| **Only-here extras** | `openQty`, `warehouse`, `departmentId`, `freeText`, `status` | `quotedQty`, `quotedDate`, `blanketAgreement` | `bpCatalogNo`, `mfrNo`, `blanketAgreement`, `agreementId`, `receivedQty`, `warehouse`, `departmentId`, `freeText`, `status` | GR: `binId`/`binCode`, `packages`, `unitCostLc`, `baseId`, `invoicedQty` · Return adds `returnReason`, `countryOfOriginCode`, `baseType`, `creditedQty` |

> **The line types already form an inheritance chain:** `ReturnLine extends GrLine` and
> `DprLine extends ApLine` (which itself chains off `GrLine`). So Goods Return and the A/P
> Down Payment Invoice inherit every GRPO field and add their clusters. This is the strongest
> existing signal that a **shared line type is viable** — the family already does it by extension.

---

## 2. Context — PHP-only vs multi-currency

| | `PrContext` | `RfqContext` | `PoContext` | GR / Return ctx |
|---|---|---|---|---|
| `rateOf`, `readOnly`, `added` | ✅ | ✅ | ✅ | ✅ |
| `isReverseCharge`, `fx`, `fxDate` | ✕ (PHP hardcoded) | ✅ | ✅ (+ `fxSource`) | ✅ |
| **withholding** (`withholdingOf`) | ✕ | ✕ | ✕ | ✅ Return only |

---

## 3. Full column availability matrix

Legend: **✅ visible** (shown by default) · **◐ hidden** (optional, in Columns menu) ·
**✕** not available · **⚠︎** field exists but no column.

Columns: **PR** = Purchase Request · **RFQ** = Purchase Quotation · **PO** = Purchase Order ·
**GR** = Goods Receipt PO (GRPO).

Columns now include **DPI** = A/P Down Payment Invoice (`DprLinesCard`).

| # | Column / concept | PR | RFQ | PO | GR | GRet | DPI | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Item No. + Description | ✅ `item` | ✅ `item` | ✅ `item` | ✅ `item` | ✅ `item` | ✅ `item` | PR: row-menu edit · others: combined cell, inline Edit/Change |
| 2 | Line Type (Item/Service) | ◐ `lineKind` | ✕ | ✕ | ✕ | ✕ | ✕ | PR read-only badge from `item.inventoryItem` |
| 3 | Required/Received/Return Qty + UoM | ✅ `qty` | ✅ `requiredQty` | ✅ `qty` | ✅ `qty` | ✅ `qty` | ✅ `qty` | GR = received · GRet = returned · DPI = down-payment qty |
| 4 | Quoted Qty | ✕ | ◐ `quotedQty` | ✕ | ✕ | ✕ | ✕ | RFQ-only |
| 5 | Open Qty / Open for IT | ◐ `openQty` | ✕ | ◐ `openQty` | ◐ `openQty` | ✕ | ✕ | read-only |
| 6 | Required Date | ◐ `requiredDate` | ✅ `requiredDate` | ✕ | ✕ | ✕ | ✕ | PR/RFQ |
| 7 | Quoted Date | ✕ | ◐ `quotedDate` | ✕ | ✕ | ✕ | ✕ | RFQ-only |
| 8 | Del. Date (delivery) | ✕ | ✕ | ✅ `deliveryDate` | ✕ | ✕ | ✕ | PO-only, row-level |
| 9 | UoM name (editable) | ✕ | ◐ `uomName` | ◐ `uomName` | ✕ | ✕ | ✕ | editable for non-item lines |
| 10 | Items per unit | ✕ | ◐ `itemsPerUnit` | ◐ `itemsPerUnit` | ✕ | ✕ | ✕ | conversion factor |
| 11 | Inventory UoM flag (Yes/No) | ✕ | ✕ | ◐ `inventoryUom` | ✕ | ✕ | ✕ | PO-only |
| 12 | Inventory Qty (converted) | ◐ `inventoryQty` | ✕ | ◐ `inventoryQty` | ◐ `inventoryQty` | ◐ `inventoryQty` | ✕ | DPI: financial, no stock |
| 13 | In Stock | ◐ `inStock` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only |
| 14 | Committed | ◐ `committed` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only |
| 15 | Ordered / On order | ◐ `ordered` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only |
| 16 | Warehouse / Whse | ✅ `warehouse` | ✕ | ◐ `warehouse` | ✅ `warehouse` | ✅ `warehouse` | ✕ | GR/GRet: "Whse / Bin" · DPI: no stock movement |
| 17 | Bin Location Allocation | ✕ | ✕ | ✕ | ✅ (in `warehouse`) | ✅ (in `warehouse`) | ✕ | when bins active |
| 18 | No. of Packages | ✕ | ✕ | ✕ | ◐ `packages` | ✕ | ✕ | GR-only |
| 19 | Price List | ✅ `priceList` | ✅ `priceListId` | ◐ `priceListId` | ◐ `priceListId` | ✕ | ✕ | field exists, no column |
| 20 | Unit / Info Price | ✅ `infoPrice` | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | PR "Info" · others "Unit" |
| 21 | Discount % | ◐ `discountPct` | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | PR has %/PHP toggle |
| 22 | Price after Discount | ✅ `priceAfterDisc` | ✕ | ◐ `priceAfterDiscount` | ◐ `priceAfterDiscount` | ✕ | ✕ | RFQ shows it in-cell only |
| 23 | Tax Code | ✅ `taxCode` | ✅ (in `pricing`) | ◐ `taxCode` | ✅ (in `pricing`) | ✅ (in `pricing`) | ✅ (in `pricing`) | shared |
| 24 | Tax Amount | ◐ `taxAmount` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only |
| 25 | Total [LC] | ✅ `total` | ✅ `total` | ✅ `totalLc` | ✅ `totalLc` | ✅ `totalLc` | ✅ `totalLc` | net total |
| 26 | Gross Total (LC) | ✕ | ✕ | ◐ `grossTotalLc` | ✕ | ✕ | ✕ | PO-only, row total incl tax |
| 27 | Gross Price after Disc. (per-unit) | ✅ `grossAfterDisc` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only |
| 28 | Preferred / line Vendor | ◐ `vendorId` | ⚠︎ `lineVendorId` | ✕ | ✅ `lineVendorId` | ⚠︎ `lineVendorId` | ⚠︎ `lineVendorId` | field, no column on RFQ/GRet/DPI · PO: header only |
| 29 | G/L Account | ◐ `glAccount` | ✕ | ✕ | ✕ | ✕ | ✕ | PR-only, read-only derived |
| 30 | BP Catalog No. | ✕ | ✕ | ◐ `bpCatalogNo` | ✕ | ✕ | ✕ | PO-only |
| 31 | Mfr No. | ✕ | ✕ | ◐ `mfrNo` | ✕ | ✕ | ✕ | PO-only |
| 32 | Department | ✅ `department` | ✕ | ◐ `department` | ✕ | ✕ | ✕ | PR + PO |
| 33 | Free Text | ✅ `freeText` | ✕ | ◐ `freeText` | ✅ `freeText` | ✅ `freeText` | ✅ `freeText` | |
| 34 | Requisition Slip No. | ✅ `requisitionSlipNo` | ✅ `requisitionSlipNo` | ◐ `requisitionSlipNo` | ✅ `requisitionSlipNo` | ✕ | ✕ | field exists, no column |
| 35 | Blanket Agreement | ✕ | ◐ `blanketAgreement` | ◐ `blanketAgreement` | ✅ `blanketAgreement` | ✅ `blanketAgreement` | ✅ `blanketAgreement` | RFQ/PO/GR/GRet/DPI |
| 36 | Base document (copied-from) | ✕ | ✕ | ✕ | ✅ `base` | ✅ `base` | ✅ `base` | GR ← PO · GRet ← GRPO/AP inv · DPI ← PO |
| 37 | Row / Line status | ◐ `lineStatus` | ✕ | ✅ `status` | ✕ | ✕ | ✕ | per-line Open/Closed |
| 38 | Row actions (⋯ menu) | ✅ `actions` | ✕ | ✕ | ✕ | ✕ | ✕ | others use inline links + onRemove |
| — | **Returns / WTax cluster ↓** (GRet + DPI in current code) | | | | | | | |
| 39 | Return Reason | ✕ | ✕ | ✕ | ✕ | ✅ `returnReason` | ✕ | GRet only (DPI isn't a return) |
| 40 | Country/Region of Origin | ✕ | ✕ | ✕ | ✕ | ✅ `countryOfOriginCode` | ◐ `countryOfOriginCode` | customs reporting |
| 41 | Warranty | ✕ | ✕ | ✕ | ✕ | ✅ `warranty` | ◐ `warranty` | from item master |
| 42 | Unit Cost Price | ✕ | ✕ | ✕ | ✕ | ✅ `unitCost` | ◐ `unitCost` | costing/margin ref |
| 43 | WT code / rate | ✕ | ✕ | ✕ | ✕ | ✅ `wt` | ◐ `wt` | withholding (reversal/down-payment) |
| 44 | WT taxable amount | ✕ | ✕ | ✕ | ✕ | ✅ `wtBase` | ◐ `wtBase` | derived from line net |

### Card-level (not line columns)

| Feature | PR | RFQ | PO | GR | GRet | DPI |
|---|---|---|---|---|---|---|
| Summary Type control | ✅ header `Select` | ✕ | ✕ | ✕ | ✕ | ✕ |
| Price Mode radio (Net/Gross) | ✕ | ✕ | ✅ (conditional) | ✕ | ✕ | ✕ |
| Multi-currency + FX | ✕ (PHP-only) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Withholding tax | ✕ | ✕ | ✕ | ✕ | ✅ | ✅ |
| Totals footer | ✅ `PurchTotalsFooter` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column visibility engine | `useColumnPrefs('pr')` | `('rfq')` | `('po')` | `('gr')` | ⚠︎ column groups | ⚠︎ `useColumnPrefs('dpr')` |

> **GRet is the outlier mechanism.** `ReturnLines` groups columns with a 4th `col()` arg
> instead of the `useColumnPrefs` show/hide engine the other five use (DPI uses
> `useColumnPrefs('dpr')`). Unifying means moving Return onto `useColumnPrefs` too.

---

## Summary of the split (current code)

- **Shared by all five:** item+desc, qty+UoM, unit/info price, discount, tax code, total.
  These are the component's spine.
- **PR-richest for:** stock (in-stock/committed/ordered), warehouse, inventory qty, G/L
  account, summary type, row actions — plus line-type badge.
- **PO-richest for:** Price Mode, BP Catalog No., Mfr No., Del. Date, Gross Total (LC),
  Inventory-UoM flag, Row status.
- **RFQ adds:** quoted qty/date, UoM name, items-per-unit, blanket agreement.
- **GR adds:** bin-location allocation (in Whse/Bin), No. of Packages, Base-document link,
  and a **rendered line Vendor column** (first doc to surface `lineVendorId`).
- **GRet (Goods Return) + DPI (A/P Down Payment Invoice) add a "credit/adjustment cluster":**
  Country of Origin, Warranty, Unit Cost Price, **withholding tax** (WT code/rate, taxable
  amount), base-doc link — plus GRet's Return Reason and DPI's **Standard Item Identification**
  + **Commodity Classification**. Spec also calls for **Serial No., Distr. Rule**, and a block of
  **BIR print UDFs** (`xSupplierName`, `xAddress`, `xTINnumber`, `xCardType`, `xWTVendor`, Price
  for Report, Customer Description, Amount in Printout) — **none built yet** on either.
  DPI carries no warehouse/stock (it's financial), so its cluster is the WTax/customs/UDF subset.

The merged column universe is the **union across all six**. The forward docs (PR/RFQ/PO/GR)
share a tight core; **Goods Return and A/P Down Payment Invoice sit furthest out** — they carry a
withholding-tax + customs + print-layout cluster that also appears on **A/P Credit Memo** and
**A/P Reserve Invoice**, not on the forward flow. Treat that cluster as an opt-in capability,
not part of the base table.

---

## Target spec (authoritative — forward flow: PR / RFQ / PO / GR)

The sections above describe the **current code**. The spec below is the **agreed target** for
the **forward-flow documents** — PR, RFQ, PO, GR (GRPO) — each with an **Item** and a **Service**
variant. (Goods Return has its own subsection after this one.) Because the merged table drops
the hard Item/Service *grid switch*, every column below becomes part of **one column universe**,
shown or hidden per document + line type via `useColumnPrefs`.

Legend: **●** in spec · **–** not in spec · **(●)** implied. Columns: PR-I = PR Item,
PR-S = PR Service, and so on.

| Column / concept | PR-I | PR-S | RFQ-I | RFQ-S | PO-I | PO-S | GR-I | GR-S | Notes |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Price Mode (Net/Gross) | – | – | – | – | ● | – | – | – | **PO only** · header-driven, conditional on "Separate Net/Gross"; not BR/IN/IL |
| Item/Service Type (toggle) | ● | ● | (●) | (●) | (●) | (●) | (●) | (●) | PR explicit; others implied by having a Service variant |
| Summary Type (card-level) | ● | – | ● | – | – | – | ● | – | Grid layout only, not data |
| Item No. | ● | – | ● | – | ● | – | ● | – | **Item only** · PO: CTRL+TAB = Alternative Items · GR: Copy From base PO |
| Item Description | ● | – | ● | – | ● | – | ● | – | **Item only** · editable override, no write-back |
| Description (service) | – | ● | – | ● | – | ● | – | ● | **Service only** · free-text, replaces Item No./Desc |
| BP Catalog No. | – | – | – | – | ● | – | – | – | **PO only** · vendor's own catalog number |
| Mfr No. | – | – | – | – | ● | – | – | – | **PO only** · Manufacturers table |
| G/L Account | – | ● | – | ● | – | ● | – | ● | **Service only** · mandatory, Chart of Accounts |
| G/L Account Name | – | ● | – | ● | – | ● | – | ● | **Service only** · auto-filled, read-only |
| Required Date | ● | ● | ● | ● | – | – | – | – | PR/RFQ; defaults from header |
| Quoted Date | – | – | ● | ● | – | – | – | – | **RFQ only** |
| Del. Date (delivery) | – | – | – | – | ● | – | – | – | **PO only** · row-level |
| Quantity / Required / Received Qty. | ● | ● | ● | ● | ● | – | ● | – | mandatory · PO/GR Service have no qty · GR = received |
| Quoted Qty. | – | – | ● | ● | – | – | – | – | **RFQ only** |
| Open Qty / Open QTY for IT | ● | ● | ● | ● | ● | – | ● | ● | read-only |
| No. of Packages | – | – | – | – | – | – | ● | – | **GR only** · logistics/handling reference |
| UoM Group | – | – | – | – | ● | – | – | – | **PO only** · 🚧 spec undescribed |
| Inventory UoM (flag) | – | – | – | – | ● | – | – | – | **PO only** · Yes/No = Items per Unit == 1 |
| UoM Code | ● | – | ● | ● | ● | – | ● | – | mandatory; PR/PO/GR Service omit |
| UoM Name | – | – | ◐ | ◐ | ● | – | – | – | editable only if item UoM Group = Manual |
| Items per unit | – | – | ◐ | ◐ | ◐ | – | – | – | conversion factor |
| Qty (Inventory UoM) | ● | – | – | – | ● | – | ● | – | Quantity × Items per Unit |
| In Stock | ● | – | – | – | – | – | – | – | **PR Item only** |
| Committed | ● | – | – | – | – | – | – | – | **PR Item only** |
| Ordered | ● | – | – | – | – | – | – | – | **PR Item only** |
| Whse | ● | – | – | – | ● | – | – | – | PR optional · **PO required per line** · GR: folded into Bin row below |
| Bin Location Allocation | – | – | – | – | – | – | ● | – | **GR only** · conditional on bin management for the warehouse |
| Unit / Info Price | ● Info | – | ● Unit | ● Unit | ● Unit | ● Unit | ● Unit | ● Unit | PR: informational · others mandatory · **PR Service: none** |
| Discount % | ● | – | ● | ● | ● | ● | ● | – | PR/GR Service omit |
| Tax Code | ● | ● | ● | ● | ● | ● | ● | ● | mandatory; priority-chain default |
| Price after Discount | ● | – | – | – | ● | ● | – | – | Unit Price − Discount% |
| Total [LC] | ● | ● | ● | ● | ● | ● | ● | ● | calculated (net) |
| Gross Total (LC) | – | – | – | – | ● | ● | – | – | **PO only** · row total incl tax |
| Gross Price after Disc. (per-unit) | ● | – | – | – | – | – | – | – | **PR Item only** · tax-inclusive unit price |
| Blanket Agreement No. | – | – | ● | ● | ● | ● | ● | ● | RFQ + PO + GR |
| Vendor (preferred / line) | ● | ● | ● | ● | – | – | ● | ● | PR: informational · RFQ/GR: line sourcing override · PO: header-level only |
| Vendor (duplicate column) | ● | ● | – | – | – | – | – | – | PR expanded-grid duplicate (SAP-B1 artifact) |
| Departments | ● | – | – | – | ● | ● | – | – | PR Item + PO |
| Free Text | ● | – | – | – | ● | – | – | – | PR Item + PO Item (GR has it in code, not spec) |
| Requisition slip No. | ● | ● | ● | ● | ● | – | ● | ● | traceability |
| Row / Line status | ◐ | – | – | – | ● | – | – | – | per-line Open/Closed |
| PriceList | ● | ● | ● | ● | ● | ● | ● | ● | drives default price |
| Return Reason | ● | ● | ● | ● | ● | ● | ● | ● | conditional; unused at request/order/receipt stage |

### Spec → implication for the merged table

- **Item vs Service is column visibility, not a grid switch.** Service line → show
  `Description` + `G/L Account` + `G/L Account Name`, hide `Item No.`/`Item Description`/
  stock/UoM; Item line → the reverse. One grid, driven by the line's type + column prefs.
- **The merged column universe** = PR ∪ RFQ ∪ PO ∪ GR (Item ∪ Service) — ~44 forward columns
  — **+** the credit/adjustment cluster (GRet ∪ DPI, and A/P Credit Memo / Reserve Invoice).
  Each document enables its subset.
- **PO is the richest Item variant** (Price Mode, BP Catalog, Mfr No., Del. Date, Gross Total,
  Inventory-UoM flag, Row status). **PR is the richest for stock** (in-stock/committed/ordered,
  warehouse, inventory qty) and requester fields. **RFQ adds** quoted qty/date. **GR adds**
  receiving columns (No. of Packages, Bin Location Allocation) + the line Vendor column.
- Date semantics differ: PR/RFQ carry **Required Date** + RFQ **Quoted Date**; PO carries
  **Del. Date** (delivery); GR carries no line date. Keep as distinct fields, not one column.

### Credit / adjustment cluster — target spec (Goods Return + A/P Down Payment Invoice)

Kept separate from the forward-flow matrix because these are **credit / financial-adjustment**
documents. **GRet** = Goods Return (`ReturnLines`), **DPI** = A/P Down Payment Invoice
(`DprLinesCard`); the same cluster also drives **A/P Credit Memo** & **A/P Reserve Invoice**.
Both reuse the forward **shared core** (Item No./Description or Service Description + G/L, Qty +
UoM, Unit Price, Discount, Tax Code, Total [LC], Blanket Agreement, Price List, line Vendor) and
add the clusters below. Legend: **●** in spec · **–** none · **◼** built · **◐** built on that
doc. GRet = ◼ in `ReturnLines`, DPI = ◐ in `DprLinesCard` unless noted.

**Customs / goods cluster:**

| Column | GRet | DPI | Built? | Notes |
|---|:--:|:--:|:--:|---|
| Return Reason | ● | – | ◼ GRet | GRet only — DPI isn't a return |
| Distr. Rule | ● | ● | – | distribution / cost-center rule |
| Country/Region of Origin | ● | ● | ◼/◐ | customs reporting |
| Standard Item Identification (GTIN/HS) | – | ● | – | **DPI-new** · regulatory/customs code |
| Commodity Classification | – | ● | – | **DPI-new** · trade/commodity code |
| Warranty | ● | ● | ◼/◐ | flag/terms from Item Master |
| Serial No. | ● (cond.) | ● (cond.) | – | serial-managed items; GRet must match received serial |
| Unit Cost Price | ● | ● | ◼/◐ | costing/margin ref, read-only |
| Qty (Inventory UoM) | ● | – | ◼ GRet | DPI has no stock |

**Withholding-tax cluster** (GRet: reverses WTax from the linked purchase · DPI: WTax on down
payments — Philippines/BIR):

| Column | GRet | DPI | Built? | Notes |
|---|:--:|:--:|:--:|---|
| xWTCode | ● | ● | partial (`wt` col derives it) | Withholding Tax Code master |
| xWTVendor | ● | ● | – | BP reference for WTax reporting |
| xTaxableAmt | ● | ● | ◼/◐ (`wtBase`) | derived from line total |
| Wtax Rate | ● | ● | ◼/◐ (in `wt`) | follows xWTCode |
| Price for Report | ● | ● | – | statutory/WTax reporting value |

**BIR print UDFs** (custom print-layout fields; none built on either):

| Column | Built? | Notes |
|---|:--:|---|
| xSupplierName · xAddress · xTINnumber · xCardType | – | BIR alphalist / tax-form printout UDFs |
| Customer Description · Amount in Printout (+ further off-screen UDFs) | – | same custom print pattern across GRet / DPI / A/P Credit Memo / Reserve Invoice |

> These customs/UDF/WTax columns are **document-class–specific**, not part of the base
> purchasing table. In the merged component they live behind `returns` / `withholding` /
> `printUdf` capability flags, enabled only for the credit/adjustment documents.

### Gaps vs current code (what the spec adds)

| Spec item | Current code | Work needed |
|---|---|---|
| Real **Service line** (free-text Description, no item) | Service = non-inventory *item* picked from master | New itemless line mode; reuse `itemType`/`priceMode` header enums |
| **G/L Account** editable + mandatory (Service) | `glAccount` read-only, derived via `expenseAccountFor()` | Add editable `glAccountId` field + Chart-of-Accounts `masterCol`; auto-fill name |
| **RFQ line Vendor** column | `lineVendorId` field exists, **no column** | Add Combobox vendor column — **GR already renders this one**, reuse it |
| **RFQ Open QTY for IT** | not present | Add read-only open-qty column to RFQ |
| **RFQ / GR Service variant** (Description + G/L) | not present | Same Service mode as PR/PO |
| **Return Reason** | present on GRet only | Add `returnReasonDef` `masterCol` to the forward docs too, conditional |
| **GR: bin allocation / packages / base-doc** | **already built** in `GrContentsCard` | Whse/Bin, No. of Packages, Base-document link, line Vendor column all present ✅ |
| **GRet/DPI: customs + WTax cluster** (country, warranty, unit cost, WT code/rate, taxable amt) | **already built** in `ReturnLines` / `DprLinesCard` | reuse as the shared credit/adjustment cluster ✅ |
| **GRet/DPI: Serial No. + Distr. Rule** | not present on either | Add serial-number picker (serial-managed items) + distribution-rule `masterCol` |
| **DPI: Standard Item Identification + Commodity Classification** | not present | **DPI-new** customs columns — add Item-Master-code + Commodity-Classification `masterCol` |
| **GRet/DPI: WTax stored fields** (`xWTCode`, `xWTVendor`, Price for Report) | WT derived in `wt`/`wtBase`, not stored | Add explicit WTax fields if BIR print needs them |
| **GRet/DPI: BIR print UDFs** (`xSupplierName`, `xAddress`, `xTINnumber`, `xCardType`, Customer Description, Amount in Printout) | not present | Add behind a `printUdf` capability; shared with A/P Credit Memo / Reserve Invoice |
| **GRet on `useColumnPrefs`** | uses `col()` group arg, not the prefs engine (DPI already uses `useColumnPrefs('dpr')`) | Migrate Return to `useColumnPrefs` so the shared component has one show/hide model |
| **Vendor duplicate column** (PR) | not present | Likely skip — SAP-B1 expanded-grid artifact |
| **Item/Service toggle wired to grid** | `itemType` header field dormant | Drive column visibility off line type |
| **PO UoM Group / UoM Code** columns | combined inside `qty`; `uomName` shown separately | 🚧 spec undescribed — confirm before adding |
| **PO: nearly everything else** | **already built** in `PoLinesCard` | Price Mode, BP Catalog, Mfr No., Del. Date, Gross Total (LC), Row status, Inventory-UoM flag, Qty-in-inventory-UoM all present ✅ |

---

## Can this be one table?

**Yes — the forward flow (PR / RFQ / PO / GR) can be a single component**, and it scales to the
credit/adjustment docs via an opt-in cluster. "One table" means **one generic
`<PurchLinesTable<T>>` + a small per-document adapter**, not four look-alike tables and not a
zero-config identical grid.

### Why it holds

- **The models already converge.** `GrLine` is effectively the superset; `PoLine` is
  structurally near-identical; `RfqLine` already uses the target names (`description`,
  `unitPrice`, `lineVendorId`). Only **PR** diverges, on three fields. And `ReturnLine` /
  `DprLine` literally `extends GrLine` — the family is already one line type by inheritance.
- **Everything that differs is config, not structure** — it maps cleanly onto the adapter:

  | Difference | How one table absorbs it |
  |---|---|
  | 3 field names (PR's `itemDescription` / `infoPrice` / `vendorId`) | accessor bridge **or** rename the model |
  | Currency: PR PHP-only vs RFQ/PO/GR multi-currency | currency/FX optional; PR passes PHP |
  | Dates: Required (PR/RFQ) · Del. (PO) · none (GR) | distinct column keys, enabled per doc |
  | Item vs Service | column visibility, not a grid switch |
  | ~44-column universe | `useColumnPrefs` + capability flags per doc |
  | Totals / lineNet / copy-from / validation | supplied by the adapter |

### The two real decisions (not blockers)

1. **Pricing rendering.** PR uses *granular* pricing columns (`infoPrice`, `discountPct`,
   `priceAfterDisc`, `grossAfterDisc`, `taxAmount`); RFQ/PO/GR use a *combined* `pricing` cell.
   The shared table must offer **both styles** (a cap picks which) or standardize everyone on
   one. This is the biggest genuine divergence.
2. **Field-name reconciliation.** Accessor bridge (no seed change, lower risk) vs renaming PR's
   three fields to the `GrLine` names (cleaner, needs a `SEED_VERSION` bump). Same as the
   adapter-vs-model-unification decision in Open decisions below.

### Verdict

| Scope | One table? | Notes |
|---|:--:|---|
| Forward flow (PR / RFQ / PO / GR) | ✅ yes | one component + adapter; build this first |
| + Goods Return / A/P Down Payment Invoice | ✅ yes | same component + opt-in `returns`/`withholding`/`printUdf` cluster |
| + A/P Credit Memo / Reserve Invoice / A/P Invoice | ✅ likely | same credit/adjustment cluster — confirm once specced |

Nothing in the six documents blocks a single table. The cost is the adapter + the pricing-style
toggle, not architectural rework.

---

## Proposed architecture

A generic **`<PurchLinesTable<T>>`** driven by a per-document **adapter config**, rather than
unifying the stored types. Fits the existing `PrefColumn<T>` generic pattern and needs **no
seed changes / no `SEED_VERSION` bump**.

```ts
interface PurchLineAdapter<T> {
  // field accessors that reconcile the 3 differing names
  desc: Accessor<T>;
  vendor: Accessor<T>;
  price: Accessor<T>;

  // capability flags — which columns this document exposes
  caps: {
    serviceLines; glAccount;          // Service mode: free-text Description + Chart-of-Accounts
    lineType; openQty; quotedQty; quotedDate; deliveryDate;
    inventoryQty; inventoryUomFlag; uomName; stock; warehouse;
    priceMode; bpCatalogNo; mfrNo;    // PO-specific
    binAllocation; packages; baseDoc; // GR-specific
    returns; withholding; printUdf;   // GRet / A/P credit cluster (opt-in)
    priceAfterDisc; taxAmount; grossAfterDisc; grossTotalLc; vendor;
    department; freeText; blanketAgreement; lineStatus; returnReason;
    requisitionSlipNo; discountModeToggle; summarizeByItem; multiCurrency;
  };

  // doc-specific services
  totals: (draft) => Totals;
  lineNet: (l: T) => number;
  // …priceAfterDiscount, inventoryQty, etc.

  currency: { code: string; fx?: number; fxDate?: string };
}
```

The component owns the **shared columns** and the `useColumnPrefs` wiring; the adapter toggles
document-specific columns and supplies currency + services.

### Open decisions

1. **Adapter vs model unification** — keep `PrLine`/`RfqLine` and bridge with accessors
   (no seed change, lower risk), **or** rename the stored model to a shared `PurchLine`
   (cleaner, but touches seeds/services + `SEED_VERSION` bump).
2. **Scope** — two classes now in scope: **forward flow** (PR + RFQ + PO + GR) and
   **credit / adjustment** (Goods Return + A/P Down Payment Invoice, with A/P Credit Memo &
   A/P Reserve Invoice as close cousins sharing the customs/WTax/print-UDF cluster). Decide
   whether to build the shared component for the forward flow first and bolt on the cluster as
   an opt-in capability, or design for both classes up front.
3. **Column set** — expose the full PR superset + RFQ extras (recommended), or a trimmed
   common set.

### Decision note — "why an adapter? why not all fields per document?"

A fair challenge: give every line one shared type carrying **all** fields, and let each document
use the subset it needs — no accessor indirection. That is the **model-unification** option, and
it is legitimate. But it removes only *one* of the adapter's four jobs:

| Adapter job | Removed by "all fields on one type"? |
|---|---|
| 1. 3 field accessors (PR's `itemDescription` / `infoPrice` / `vendorId`) | ✅ yes — component reads `line.description` directly |
| 2. **Which columns each doc shows** | ❌ no — still per-doc |
| 3. **Services** (totals, validation, pricing, copy-from) | ❌ no — still per-doc |
| 4. **Currency on/off** | ❌ no — still per-doc |

Why #2–#4 remain:

- **You can't render all ~44 columns on every document.** A PR must *not* show Blanket
  Agreement, Gross Total (LC), BP Catalog No., or the WTax columns — they're meaningless there.
  So each doc still declares *which* columns it uses; that list **is** the adapter, renamed.
- **Fields aren't behavior.** `prTotals()` ≠ `poTotals()`, validation differs, GR copies from a
  PO while Return copies from a GRPO. One shared type doesn't unify that logic.

Costs of one fat type (so it's a trade-off, not a free win):

- **Meaningless fields invite bugs** — a PR line carrying `receivedQty` / `binCode` /
  `deliveryDate` / `xWTCode` that are never populated; code can read them and silently get `0`/`''`.
- **Weaker type safety** — today TS stops a PR card referencing `deliveryDate`; one merged type
  loses that.
- **Fatter seeds + a `SEED_VERSION` bump** — every mock line gains ~20 defaulted fields.

**Resolution (recommended):** make the line *shape* uniform enough that the component reads
fields directly — either one `PurchLine`, or just rename PR's three fields to the `GrLine` names
— and keep **per-doc column lists + services** as the only remaining config. That residual is the
real, minimal "adapter"; it exists regardless of the field-unification choice. The accessor
bridge (keep separate types) is the lower-risk way to reach the same component without touching
seeds; the rename is cleaner long-term at the cost of a migration.

---

## Related

- `docs/purchasing-lines-table-refactor.md` — earlier pass bringing purchasing tables to the
  sales-table UX standard (Edit/Done flow, inline add-row, column settings).
- `src/pages/purchasing/shared/purchColumns.tsx` — existing shared column builders
  (`textCol`, `masterCol`, `amountCol`) and the `PrefColumn<T>` foundation to build on.
