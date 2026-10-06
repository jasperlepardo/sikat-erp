# Inventory — User Stories

## 1. Settings › Inventory

_Master data that items depend on. Configure these before creating items._

**US-INV-010**
As an administrator, I want to manage item groups so that items can be classified for reporting, discount matrices, and GL account defaults.

**Acceptance criteria:**
- I can create, edit, and deactivate item groups with a code and name.
- Each item group can carry default GL accounts (inventory, COGS, revenue) that items inherit when their GL-by setting is "Item Group."
- Item group codes must be unique.

---

**US-INV-011**
As an administrator, I want to manage units of measure and UoM groups so that the correct conversion factors are available when defining item UoMs.

**Acceptance criteria:**
- I can create UoMs with a code and name (e.g., PC, BOX, CASE).
- I can create UoM groups that bundle related UoMs with conversion factors relative to the base UoM of the group.
- Items reference a UoM group to inherit its conversions, or define their own per-item conversions.

---

**US-INV-012**
As an administrator, I want to maintain a list of manufacturers so that items can be linked to their brand and manufacturer part numbers are stored centrally.

**Acceptance criteria:**
- I can create manufacturers with a name and optional website.
- Items reference manufacturers on their Manufacturers card; each row stores the manufacturer part no. and warranty template.

---

**US-INV-013**
As an administrator, I want to maintain supporting master lists — customs groups, commission groups, shipping types, warranty templates, and item properties — so that the correct options are available when configuring items.

**Acceptance criteria:**
- Customs groups store an HS code and duty percentage; they are selectable on the item's General tab.
- Commission groups store a commission percentage; they default that rate on items and salespeople.
- Shipping types are a simple named list; they default on item sales lines.
- Warranty templates are a named list linked to items and applied per serial number on sales.
- Item properties are up to 64 user-defined boolean labels shown as checkboxes on the item's Properties tab.
- All lists support create, edit, and deactivate.

---

**US-INV-014**
As an administrator, I want to configure inventory settings so that item numbering, default costing method, and default GL accounts behave consistently with company policy.

**Acceptance criteria:**
- I can set the item numbering mode: Auto (system-generated) or Manual.
- I can set the company-wide default costing method (Moving Average, FIFO, Standard Price).
- I can set default GL accounts used when an item has no explicit account mapping.

---

## 2. Warehouses & Bins

_Physical storage locations. Define these before creating items so warehouse defaults and bin assignments are available._

**US-INV-020**
As a system administrator, I want to set up warehouses with their GL account mappings so that inventory transactions post to the correct accounts per location.

**Acceptance criteria:**
- A warehouse record holds: code, name, location (address), and linked GL accounts (inventory, COGS, revenue, price difference).
- I can mark a warehouse inactive to remove it from transaction pickers.
- Warehouse codes must be unique.

---

**US-INV-021**
As a warehouse manager, I want to enable bin locations on a warehouse and define its bin structure so that items can be stored and tracked at the bin level.

**Acceptance criteria:**
- I can enable bins on a warehouse and configure up to 4 sublevel tiers (e.g., Aisle, Row, Shelf, Position) with custom names and value lists.
- The bin code is auto-generated from the combination of selected sublevel values.
- I can bulk-generate a range of bins from sublevel value ranges (e.g., Aisles A–C, Rows 01–05).

---

**US-INV-022**
As a warehouse manager, I want to manage individual bin locations — activating, deactivating, or renaming them — so that the bin list stays current as the warehouse layout changes.

**Acceptance criteria:**
- I can view all bins for a warehouse in a filterable list showing: bin code, description, sublevel values, and active status.
- I can activate or deactivate individual bins with a required reason; the reason is stored for audit purposes.
- I can add new sublevel values or rename existing ones via the bin tools panel.
- Deactivated bins are hidden from transaction pickers but remain in the list with an "Inactive" badge.

---

## 3. Items

_Stories are ordered by the item detail record's tabs and side-panel sections._

### Header & Identity

**US-INV-030**
As an inventory manager, I want to create and maintain item master records so that items can be used consistently across purchasing, sales, and inventory transactions.

**Acceptance criteria:**
- I can create an item with: item no. (manual or auto-generated), name, description, foreign name, item group, item type (Items, Labor, Travel), and usage flags (purchase item, sales item, inventory item, fixed asset item).
- Labor and Travel items are never stocked; the Inventory item flag is forced off and greyed out for these types.
- Fixed asset items capitalize purchases to Accounting › Fixed Assets instead of posting to expense.
- I can set a validity date range; items outside the range are flagged as expired and blocked from new transactions.
- I can mark an item inactive to remove it from pickers without deleting it.

---

**US-INV-031**
As a warehouse supervisor, I want to set the tracking method on an item so that individual units or lots can be traced through the supply chain and warranties are honored accurately.

**Acceptance criteria:**
- I can set the tracking method on an item to: None, Batches, or Serial Numbers.
- Serial-managed items require one serial number per unit on every stock movement (receipt, transfer, issue, count).
- Batch-managed items require a batch number on every stock movement; multiple units can share a batch.
- Counted quantities for serial-managed items must be whole numbers; fractional quantities are blocked with a validation error.
- Once transactions are posted against the item, the tracking method is locked and cannot be changed.

---

### General Tab

**US-INV-032**
As an accountant, I want to control how G/L accounts and the valuation method are assigned to an item so that postings go to the correct accounts without having to configure every item individually.

**Acceptance criteria:**
- I can set G/L accounts by: Item Group (accounts inherited from the item group — recommended), Item Level (accounts set directly on the item), or Warehouse (accounts taken from each warehouse's settings).
- When set to Item Group, the inherited inventory, COGS, and revenue accounts are shown as read-only for reference.
- When set to Item Level, I can pick the inventory account, COGS account, and revenue account directly.
- I can set the valuation method (Moving Average, FIFO, Standard Price) per item, defaulting from the item group but overridable.
- Once documents are posted against the item, the valuation method is locked and shown as read-only.

---

**US-INV-033**
As an inventory manager, I want to assign trade and tax attributes to an item so that import duties, excise tax, and VAT treatment are determined automatically on transactions.

**Acceptance criteria:**
- I can set the country of origin and a customs group (with its HS code and duty %) on the item.
- I can enter a GTIN / UPC code for the item's primary barcode reference.
- I can flag the item as tax liable (VAT applies on sales) or not.
- I can flag the item as subject to excise tax and select its excise category (fuel, alcohol, tobacco, sweetened drinks, etc.); available categories and rates are maintained in Settings › Accounting & Tax.
- If the selected excise category has no rate configured, the system warns me and links to Settings to fix it.
- I can set the issue method (Manual or Backflush) and flag the item as a phantom directly from this tab; both fields mirror the Production Data tab.

---

### Units of Measure Tab

**US-INV-034**
As an inventory manager, I want to define units of measure and conversion factors for each item so that I can buy in cases, stock in pieces, and sell in boxes without manual conversion.

**Acceptance criteria:**
- I can set the item's base (inventory) UoM.
- I can attach a UoM group to the item for preset conversion factors, or define per-item alternate UoMs with custom quantities.
- Each alternate UoM can have its own price override; if left blank, the price defaults to base price × conversion factor.
- Each UoM row stores dimensions (length, width, height, volume) and weights (net, gross) for logistics calculations.
- I can flag each UoM as available for purchase documents, sales documents, or both.
- Transaction lines that pick an alternate UoM automatically show the converted quantity against inventory.

---

### Purchasing Tab

**US-INV-035**
As a purchasing officer, I want to store vendor-specific catalog numbers on each item so that purchase orders and vendor invoices can be matched by the vendor's own part number.

**Acceptance criteria:**
- I can add multiple vendor rows to an item: each row holds the vendor and the vendor's item number (their catalog reference).
- The preferred vendor is set via the item's default vendor field and defaults on new purchase order lines.
- Vendor rows can be added and removed inline on the item record.

---

**US-INV-036**
As a purchasing officer, I want to set the withholding tax group, purchase tax group, and import duty on an item so that the correct EWT rate and landed cost duty are applied automatically on purchase transactions.

**Acceptance criteria:**
- I can set the default purchasing UoM; it pre-fills purchase order lines.
- I can set a duty percentage used in landed cost calculations.
- I can assign a purchase tax group and optionally a fixed purchase tax code that overrides the group on every purchase line.
- I can assign a withholding group that drives the Expanded Withholding Tax (EWT) ATC code when the item is purchased from a subject vendor.
- The withholding group hint shows whether it applies to all vendors, Top Withholding Agents only, or not at all.

---

### Sales Data Tab

**US-INV-037**
As a sales coordinator, I want to store sales defaults on each item so that sales orders and invoices are pre-filled without manual entry.

**Acceptance criteria:**
- I can set a base price (VAT inclusive, per inventory UoM) and a default sales UoM.
- I can set a selling item no. that prints on sales documents instead of the internal item no.
- I can assign a sales tax group and optionally a fixed sales tax code that overrides the group on every sales line.
- I can assign a commission group and override the commission percentage per item.
- I can set a sales lead time (days) that populates the promised delivery date on sales orders.
- I can assign a shipping type and a warranty template; warranty templates are applied per serial number when the item is serial-managed.
- Sales transactions use the item's base price unless a price list or special price overrides it.

---

### Inventory Data Tab

**US-INV-038**
As an inventory manager, I want to see live stock levels on the item record and configure reorder thresholds so that I can monitor stock health without leaving the item.

**Acceptance criteria:**
- The Inventory Data tab shows four stock cards: In Stock, Committed (open sales/production orders), Ordered (open purchase orders), and Available (in stock − committed + ordered).
- Each card breaks down quantities per warehouse with a proportional bar for quick visual comparison.
- I can set global minimum stock, maximum stock, minimum order quantity, and cycle count period (days) for MRP and reorder alerts.
- For Standard Price items, I can edit the item cost directly; for Moving Average and FIFO items, the cost is system-calculated from receipts and shown as read-only.

---

### Planning Data Tab

**US-INV-039**
As a production planner, I want to configure MRP and production settings on an item so that the system can suggest replenishment and production orders automatically.

**Acceptance criteria:**
- I can set the planning method (MRP, MPS, or None) and procurement method (Buy or Make).
- For planned items, I can set lead time (days), tolerance (days), planning horizon (days), order multiple, minimum order quantity, and maximum order quantity.
- The system shows an example MRP suggestion (e.g., "a need for 14 PC becomes a suggestion for 24 PC") based on the current order rules.
- I can set the issue method (Manual or Backflush) and designate production and component warehouses on the Production Data tab.
- I can flag an item as a phantom: it is never stocked; its BOM components are exploded directly into the parent production order.
- If the procurement method is Make but no BOM exists, a warning is shown linking to Manufacturing › Bills of Materials.

---

### Properties, Attachments & Barcodes Tabs

**US-INV-040**
As a compliance officer, I want to tag items with user-defined properties so that I can segment and report on custom classifications (e.g., consignable, fragile, refrigerated).

**Acceptance criteria:**
- Up to 64 boolean properties can be defined in Settings › Inventory › Item Properties, each with a custom label.
- The item's Properties tab shows all defined properties as checkboxes.

---

**US-INV-041**
As an inventory manager, I want to attach files to an item record so that spec sheets, warranty cards, and compliance certificates are stored alongside the item.

**Acceptance criteria:**
- I can upload one or more files on the Attachments tab.
- Each attachment shows its filename, upload date, and a download link.

---

**US-INV-042**
As a warehouse staff member, I want to manage barcodes on an item so that I can scan any packaging unit during receiving and picking and be taken to the correct item.

**Acceptance criteria:**
- I can add multiple barcodes to an item, each linked to a UoM and an optional free-text note.
- The item list search accepts a barcode value and returns the matching item.
- Barcode values must be unique across all items.

---

### Side-Panel Sections

**US-INV-043**
As a warehouse supervisor, I want to set per-warehouse defaults on each item so that stock receipts automatically land in the correct bin for each location.

**Acceptance criteria:**
- I can add warehouse rows to the item: each row holds the warehouse, a preferred bin (when bins are enabled), and a preferred vendor for that location.
- If the item has no warehouse row for a transaction's warehouse, the warehouse's own default bin is used as a fallback.
- Warehouse rows can be added and removed inline.

---

**US-INV-044**
As a product manager, I want to link manufacturers and their part numbers to an item so that I can track the brand catalog reference and the applicable warranty template.

**Acceptance criteria:**
- I can add multiple manufacturer rows to an item: each row holds the manufacturer, the manufacturer's catalog number, and the warranty template.
- Manufacturer rows can be added and removed inline.

---

### Transactions Tab

**US-INV-045**
As an inventory manager, I want to see all document rows linked to an item in one place so that I can track its open commitments and purchasing activity without navigating to each module.

**Acceptance criteria:**
- The Transactions tab lists all document rows the item appears on: purchase requests, RFQs, purchase orders, quotations, sales orders, deliveries, invoices, goods receipts, and inventory transfers.
- I can filter by document type, status (open, overdue, all), and free-text (document no., partner, status).
- Summary stats show the count of open and overdue rows at a glance.
- Clicking a document row navigates to that document's detail page (for modules that are built); modules not yet built are shown with a "not available" label instead of a link.

---

### Field Locking

**US-INV-046**
As an inventory manager, I want the system to prevent changes to critical item fields after transactions have been posted so that historical records remain consistent.

**Acceptance criteria:**
- Once any document is posted against an item, the following fields lock and become read-only: Item No., item type, inventory UoM, tracking method, and valuation method.
- A tooltip on each locked field explains why it is locked.
- All other fields (name, description, prices, tax codes, etc.) remain editable after transactions exist.

---

## 4. Stock on Hand

**US-INV-050**
As an inventory manager, I want to see current stock levels — in stock, committed, ordered, and available — per item and warehouse so that I can make informed purchasing and fulfillment decisions.

**Acceptance criteria:**
- A Stock on Hand report shows: item no., item name, warehouse, in stock, committed (reserved for open sales/transfers), ordered (on open purchase orders), and available (in stock − committed + ordered).
- I can toggle between a per-warehouse view (one row per item-warehouse combination) and a per-item summary (quantities rolled up across all warehouses).
- I can filter by warehouse or by stock status (all, low stock, out of stock).
- Each row links to the item master for quick access.

---

## 5. Stock Movements (Inventory Transfers)

**US-INV-060**
As a warehouse supervisor, I want to create an inventory transfer document to move stock between warehouses so that the movement is traceable and both warehouse balances are updated immediately upon posting.

**Acceptance criteria:**
- A transfer document has a header (transfer no., date, from warehouse, to warehouse, remarks) and one or more item lines.
- Each line holds: item, quantity, UoM, and optionally from-bin and to-bin (when bins are enabled on the respective warehouses).
- From and to warehouses can be set at the header level (applied to all lines) or overridden per line.
- Posting the transfer reduces stock at the source warehouse and increases it at the destination.

---

**US-INV-061**
As a warehouse supervisor, I want to search and filter the list of inventory transfers so that I can quickly find historical movements for a specific item or warehouse.

**Acceptance criteria:**
- The transfer list supports free-text search across transfer no., warehouse names, item, and remarks.
- Rows show: transfer no., date, from warehouse, to warehouse, status, and total lines.
- Clicking a row opens the transfer detail.

---

## 6. Stock Counts

**US-INV-070**
As a warehouse supervisor, I want to create a stock count document that supports single or multiple counters so that counts can be independently verified and discrepancies caught before posting.

**Acceptance criteria:**
- A count document has a header (count no., date, count time, counting type — single or multiple counters) and one or more counter rows (each with a name).
- Single counting requires one counter; multiple counting requires at least two, with no duplicate names.
- Each line holds: item, warehouse, UoM, system quantity (expected), and one counted-quantity field per counter.
- Lines cannot repeat the same item-warehouse combination.
- Serial-managed items must be counted in whole units.
- A count can be saved as draft and updated before being closed.

---

**US-INV-071**
As a finance controller, I want to post approved stock count variances to inventory so that the general ledger reflects the corrected stock value.

**Acceptance criteria:**
- Before a count can be copied to a posting, all lines must be marked as counted and all counters must agree on the quantity; lines with disagreements block the copy action.
- From a closed count with no disagreements, I can create a posting document that converts variance lines into inventory adjustments.
- The posting document shows each adjusted item, the quantity change (positive or negative), and the G/L impact.
- Posting the document updates system stock and creates a journal entry (Dr/Cr Inventory Adjustment account).
- Once posted, the count and posting are locked from further edits.

---

**US-INV-072**
As an auditor, I want to view a list of all stock count postings so that I can trace every inventory adjustment back to a physical count.

**Acceptance criteria:**
- A Postings list shows all posted inventory postings with: posting no., date, warehouse, total lines, and the source count reference.
- Each posting links to its detail view showing the full line breakdown.

---

## 7. Price Lists

**US-INV-080**
As a sales manager, I want to create multiple price lists (e.g., Walk-in, Dealer, Online) so that different customer segments are charged the correct price automatically.

**Acceptance criteria:**
- A price list has a name, currency, rounding rule, and an optional factor applied to base prices.
- I can add item-specific price rows to override the factor-based price for individual items.
- A price list can be assigned to a customer; their sales orders and invoices default to that list.

---

**US-INV-081**
As a sales manager, I want to define special prices for specific customers or customer groups so that negotiated rates apply automatically without manual override on every order.

**Acceptance criteria:**
- I can create a special price row linking an item, a business partner (or BP group), a price list, and an override price.
- Special prices take precedence over the base price list price when the BP is selected on a transaction.
- I can set an effective date range; expired special prices are ignored.

---

**US-INV-082**
As a sales manager, I want to set up period and volume discounts so that customers automatically receive tiered discounts based on order quantity or promotional dates.

**Acceptance criteria:**
- A period discount row specifies: item, BP or BP group, price list, date range, and a discount percentage.
- A volume discount row specifies: item, BP or BP group, price list, minimum quantity, and a discount percentage.
- When both apply, the higher discount wins (configurable).
- Discounts apply as a percentage reduction on the resolved price list price.

---

**US-INV-083**
As a sales manager, I want to set up a discount matrix by BP group and item group so that I can define blanket discounts for a customer segment across a product category in one place.

**Acceptance criteria:**
- A discount group row links a BP group to an item group with a discount percentage.
- On a sales order line, if the item's item group and the customer's BP group match a discount group row, the discount is applied automatically.
- I can view and edit all discount group rows in a single table on the Price Lists page.

---

## 8. Planned (Not Yet Built)

**US-INV-090**
As a warehouse supervisor, I want a Pick & Pack workspace so that I can process fulfillment for open sales orders — pick items from bins, pack them into boxes, and confirm shipment — without leaving a single screen.

**Acceptance criteria:**
- Open sales order lines due for picking are listed with: order no., customer, item, qty to pick, and assigned bin.
- I can confirm a pick line, which reserves the quantity and logs the picker.
- Packed boxes are assigned a tracking reference before shipment confirmation.

---

**US-INV-091**
As an inventory manager, I want an Inventory Insights dashboard so that I can see key metrics (turnover, slow movers, stockout risk, overstock) at a glance without running individual reports.

**Acceptance criteria:**
- Dashboard cards show: total inventory value, number of items below reorder point, top 10 fast movers (by qty sold), and top 10 slow movers (no movement in 90+ days).
- I can filter insights by warehouse and item group.
- Each card drills down to the underlying item or transaction list.

---

**US-INV-092**
As a finance controller, I want to see the inventory value per item on the Stock on Hand report so that I can cross-reference against the balance sheet.

**Acceptance criteria:**
- A "Value" column shows in stock quantity × item cost (PHP).
- The value column is visible in item-summary view only; per-warehouse rows show quantities but not value to avoid double-counting.
