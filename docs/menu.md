# Sidebar Menu

The sidebar is defined in [`src/app/nav.tsx`](../src/app/nav.tsx) as `NAV`. It condenses SAP Business One's ~590 menu entries into module **hubs**. Each hub opens a submenu of pages.

**How routes work**

- A leaf's `id` is its route: `/#/${id}` (Home is `/#/`).
- Hub pages get the id `<hub-slug>/<page-slug>`. Slugs are lower-case, `&` becomes `and`, text in parentheses is dropped, and anything else that isn't a word character becomes `-`. For example, `Returns & Credits` → `returns-and-credits`, and `Quotations (RFQ)` → `quotations`.
- Pages that don't have a route in [`src/app/router.tsx`](../src/app/router.tsx) show the **Placeholder** screen ("This screen hasn't been prototyped yet.").
- Global services (the ⌘K command bar, Print / Email / Export, Recurring and the profile) live in the Navbar and on each record, not in the sidebar.

**Status legend:** ✅ built · ⬜ placeholder. For placeholders, *What it does* describes what the page is meant to do (its SAP Business One counterpart), not current behavior.

**Shared patterns on built pages**

- **List pages** have a header with filter tabs (with counts), a search box, a sortable table and a **New** button. Clicking a row opens the record.
- **Document and record pages** have a side column (identity fields and subsidiary cards), tabbed main content, Prev/Next buttons, Cancel/Save, and a **"You can also"** menu (`MoreMenu`) for extra actions. Items, Partners and Purchase Orders also have top-level views: **Details · Transactions · Activity**. Activity is still a placeholder.
- **Tabbed settings pages** (`TabbedPage`) keep the active tab and the open record in the URL: `…/:tab?/:recordId?`. Each tab is a master list: a table, then a record form when a row is opened.

---

## Core

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Home | `/` | ✅ | Dashboard with three stat cards: **Stocked items**, **Low or out of stock**, and **Inventory value at cost (PHP)**. |
| Inbox › Approvals | `/inbox/approvals` | ⬜ | Documents waiting for your approval (approval procedures). |
| Inbox › Tasks | `/inbox/tasks` | ⬜ | Activities and to-dos assigned to you. |
| Inbox › Drafts | `/inbox/drafts` | ⬜ | Your saved, unposted draft documents. |
| Business Partners | `/business-partners` | ✅ | The master list of every lead, customer and vendor, with one record per company or person. See [Business partner record](#business-partner-record). |

**Business Partners list:** filters are All · Leads · Customers · Vendors · Inactive. Columns are Partner, Group, Contact and City.

## Customers

### CRM

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Leads | `/crm/leads` | ✅ | "Prospects you haven't sold to yet." Partner list scoped to the `lead` role. Filters: All · New · Contacted · Qualified · Lost. Has a Source column. Opening a lead shows the [Business partner record](#business-partner-record), which offers **Convert to customer**. |
| Pipeline | `/crm/pipeline` | ⬜ | Sales opportunities by stage, with expected value and close date. |
| Activities | `/crm/activities` | ⬜ | Calls, meetings, tasks and notes logged against partners. |
| Campaigns | `/crm/campaigns` | ⬜ | Marketing campaigns and their target partner lists. |
| Insights | `/crm/insights` | ⬜ | CRM reports such as pipeline and win/loss. |

### Sales

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Customers | `/sales/customers` | ✅ | "Businesses and people you sell to." Partner list scoped to the `customer` role. Filters: All · Active · Inactive. Has a Credit limit column (with payment terms). |
| Quotations | `/sales/quotations` | ⬜ | Price offers to customers. |
| Sales Orders | `/sales/sales-orders` | ✅ | Customer orders, priced by the customer's price list and pricing rules. Open lines commit stock. **Copy to delivery** ships them. |
| Deliveries | `/sales/deliveries` | ✅ | Goods shipped to customers, usually copied from a sales order. Adding one takes stock out, updates the order's delivered quantities and posts Dr COGS (or Shipped Goods) / Cr Inventory at item cost. Cancel reverses all three. |
| Invoices | `/sales/invoices` | ⬜ | A/R invoices (BIR sales invoices) that post revenue and output VAT. |
| Returns & Credits | `/sales/returns-and-credits` | ⬜ | Customer returns and A/R credit memos. |
| Payments Received | `/sales/payments-received` | ⬜ | Incoming payments applied to invoices, including creditable withholding tax. |
| Collections | `/sales/collections` | ⬜ | Overdue receivables and dunning. |
| Agreements | `/sales/agreements` | ⬜ | Blanket agreements and contracts with customers. |
| Insights | `/sales/insights` | ⬜ | Sales reports. |

## Operations

### Purchasing

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Vendors | `/purchasing/vendors` | ✅ | "Suppliers you buy from." Partner list scoped to the `vendor` role. Filters: All · Active · Inactive. Has a Payment terms column. |
| Requests | `/purchasing/requests` | ⬜ | Internal purchase requests. |
| Quotations (RFQ) | `/purchasing/quotations` | ⬜ | Requests for quotation sent to vendors. |
| Purchase Orders | `/purchasing/purchase-orders` | ✅ | "Orders placed with vendors, from draft to fully received." See [Purchase order record](#purchase-order-record). |
| Goods Receipts | `/purchasing/goods-receipts` | ✅ | "Goods and services received from vendors." Adding a receipt puts the stock in and updates the PO it came from. See [Goods receipt record](#goods-receipt-record). |
| Bills | `/purchasing/bills` | ✅ | "A/P invoices from vendors: what you owe, billed against goods receipts or purchase orders." See [A/P invoice record](#ap-invoice-record). |
| Returns & Debits | `/purchasing/returns-and-debits` | ✅ | Goods sent back to vendors (goods returns) and the vendors' credit notes (A/P credit memos), one tab each. See [Goods return record](#goods-return-record) and [A/P credit memo record](#ap-credit-memo-record). |
| Payments Made | `/purchasing/payments-made` | ✅ | Outgoing payments: money paid to vendors against their bills (or on account), or straight to G/L accounts. This is where realized exchange gains and losses post. See [Outgoing payment record](#outgoing-payment-record). |
| Landed Costs | `/purchasing/landed-costs` | ⬜ | Spreads freight, duty and brokerage onto imported item costs. |
| Agreements | `/purchasing/agreements` | ⬜ | Blanket agreements with vendors. |
| Insights | `/purchasing/insights` | ⬜ | Purchasing reports. |

**Purchase Orders list:** filters are All · Draft · Open · Not Confirmed · Closed · Cancelled. Columns are No. (with the vendor reference), Vendor, Posting date, Delivery date, Received, Total and Status.

**Bills list:** filters are All · Draft · Open · Closed · Cancelled. Columns are No. (with the vendor's invoice no.), Vendor, Posting date, Due date (flagged Overdue or Payment block), Purchase order, Total and Status.

**Goods Receipts list:** filters are All · Draft · Open · Closed · Cancelled. Columns are No. (with the vendor reference), Vendor, Posting date, Purchase order, Quantity (with the line count), Total and Status.

### Inventory

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Items | `/inventory/items` | ✅ | "The item master: products, materials and services you buy, sell and stock." See [Item record](#item-record). |
| Stock on Hand | `/inventory/stock-on-hand` | ✅ | "In stock, committed, ordered and available — per warehouse or per item." Read-only. |
| Stock Movements | `/inventory/stock-movements` | ✅ | "Inventory transfers between warehouses." Company-wide stock doesn't change, only where it sits. See [Inventory transfer record](#inventory-transfer-record). |
| Stock Counts | `/inventory/stock-counts` | ✅ | Two steps, as in SAP: an Inventory Counting records what was found against the book quantity (no stock change); an Inventory Posting copied from it adjusts stock by the variance and books it. Single or multiple counters; Freeze blocks stock movements while the count is open. See [Stock count record](#stock-count-record). |
| Pick & Pack | `/inventory/pick-and-pack` | ⬜ | Pick lists and packing for open sales orders. |
| Price Lists | `/inventory/price-lists` | ✅ | Price tiers assigned to partners, and the rules on top of them. A document line takes the first match: a special price, then a period or volume discount, then a discount group. |
| Warehouses & Bins | `/inventory/warehouses-and-bins` | ✅ | Where stock is kept. Bin-enabled warehouses hold stock in bin locations, and items stocked there need a default bin. |
| Insights | `/inventory/insights` | ⬜ | Inventory reports (valuation, aging, movement). |

**Items list:** filters are All · Inventory · Low stock · Non-stock · Not valid. Columns are Item, Group, In stock (with the minimum), Available, Base price and Status.

**Stock on Hand:**
- Filters: All · Below minimum · Out of stock.
- View switch: **By warehouse** or **By item (all warehouses)**.
- It can also be narrowed by warehouse and item group, and searched.
- Each row shows a status badge: In stock, Below minimum or Out of stock.

**Stock Movements list:** filters are All · Draft · Posted. Columns are No., From → To, Posting date, Quantity, Value at cost and Status.

**Stock Counts list:** tabs are All counts · Open · Closed · Inventory postings. Counts show No., Warehouse, Count date and time, Counted by, Counted (with variances and counter disagreements) and Status; postings show No., Warehouse, Posting date, From count, Lines and Total.

**Price Lists tabs:**

| Tab | What it does |
|---|---|
| Price lists | Price tiers (base price, factor, gross/net of VAT), plus an **Item prices** table per list. Tick *Manual* to set an item's price by hand. |
| Special prices | Negotiated prices for one business partner, item by item: a fixed unit price or a % off a price list. Can have validity dates and quantity tiers. Checked first. |
| Period & volume discounts | Promotions for a date range, or % breaks by line quantity, for a partner or BP group on an item or item group. |
| Discount groups | % off the price list for every partner in a BP group buying from an item group. Has no dates. |

**Warehouses & Bins tabs:**

| Tab | What it does |
|---|---|
| Warehouses | Warehouse code, name, address, the bin-enabled flag and active status. |
| Bin locations | Storage positions in bin-enabled warehouses, coded Warehouse-Aisle-Shelf-Level. Shows each bin's item quantity, number of items and weight. Tools: **Generate bins** (bulk-create from sublevel ranges) and **Modify bin codes** (rename in bulk, with a preview and a list of affected draft transfers). |
| Sublevel codes | The aisle, shelf and level codes that bins are addressed by, e.g. `WH-MNL-A-01-02`. |

### Manufacturing

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Bills of Materials | `/manufacturing/bills-of-materials` | ⬜ | Components and resources that make up a finished item. |
| Production Orders | `/manufacturing/production-orders` | ⬜ | Issue components and receive finished goods. |
| Planning (MRP) | `/manufacturing/planning` | ⬜ | Material requirements planning: recommends purchase and production orders. |
| Resources | `/manufacturing/resources` | ⬜ | Machines and labor, with their capacity and cost. |
| Costing | `/manufacturing/costing` | ⬜ | Standard and actual production cost roll-ups. |

### Projects

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Projects | `/projects/projects` | ⬜ | Projects with stages, budgets and linked documents. |
| Timesheets | `/projects/timesheets` | ⬜ | Time logged against projects. |
| Insights | `/projects/insights` | ⬜ | Project profitability reports. |

### Service

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Service Calls | `/service/service-calls` | ⬜ | Customer service tickets. |
| Contracts | `/service/contracts` | ⬜ | Service and warranty contracts. |
| Equipment | `/service/equipment` | ⬜ | Customer equipment cards (serial-numbered units sold). |
| Insights | `/service/insights` | ⬜ | Service reports. |

## Finance

### Banking

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Accounts | `/banking/accounts` | ⬜ | The company's house bank accounts and their balances. |
| Reconciliation | `/banking/reconciliation` | ⬜ | Match bank statements to book entries. |
| Deposits | `/banking/deposits` | ⬜ | Deposit cash, checks and card receipts to the bank. |
| Checks | `/banking/checks` | ⬜ | Checks issued for payment. |
| Cards | `/banking/cards` | ⬜ | Credit card receipts and settlements. |
| Payment Orders | `/banking/payment-orders` | ⬜ | Payment runs: batch vendor payments. |
| Insights | `/banking/insights` | ⬜ | Cash position reports. |

### Accounting

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Statements | `/accounting/statements` | ⬜ | Balance sheet, income statement and trial balance. |
| Journal Entries | `/accounting/journal-entries` | ✅ | Every ledger posting: manual entries (balanced, in an open period, never edited — reversed instead) and the ones documents make on add and cancel (inventory transfers and postings, goods receipts, A/P invoices, payments, deliveries). |
| Journal Vouchers | `/accounting/journal-vouchers` | ✅ | Folders of draft manual journal entries, reviewed before they post. An entry can be saved unbalanced (with a warning); posting one entry or the whole voucher makes real journal entries, so a voucher can be partly posted. Open entries and vouchers with nothing posted can be deleted. |
| Chart of Accounts | `/accounting/chart-of-accounts` | ✅ | "Balance sheet and income statement accounts for a VAT-registered Philippine retailer." See below. |
| Reconciliations | `/accounting/reconciliations` | ⬜ | Match open G/L and partner items. |
| Period Close | `/accounting/period-close` | ⬜ | Posting periods, closing and year-end. |
| Budgets | `/accounting/budgets` | ⬜ | Budgets per account and cost center. |
| Cost Accounting | `/accounting/cost-accounting` | ⬜ | Dimensions, cost centers and distribution rules. |
| Fixed Assets | `/accounting/fixed-assets` | ⬜ | The asset register and depreciation. |
| Tax | `/accounting/tax` | ⬜ | BIR returns and reports (2550Q, 1601-EQ, SLSP, alphalists). |
| Insights | `/accounting/insights` | ⬜ | Financial analytics. |

**Chart of Accounts:**
- **Filters:** All, plus one tab per drawer (Assets, Liabilities, Equity, Revenue, Cost of sales, Operating expenses, and so on).
- **Columns:** Account, Drawer, Level (Title or Active account), Normal balance, Statement line, Flags, Currency, Used in and Status.
- **Title accounts** group the accounts below them. Documents post only to active accounts.
- **Control accounts** take postings only through business partners.
- A warning appears when accounts that are in use are changed.
- **Account record sections:**
  - **Reporting:** current vs. non-current classification.
  - **Posting controls:** required dimensions.
  - **Period-end and tax.**

## People

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Employees | `/people/employees` | ⬜ | The employee master (feeds compensation withholding tax). |
| Absences | `/people/absences` | ⬜ | Leave and absence records. |

## Insights

### Reports

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Library | `/reports/library` | ⬜ | The standard report catalog. |
| Dashboards | `/reports/dashboards` | ⬜ | KPI dashboards. |
| Builder | `/reports/builder` | ⬜ | Build custom reports and queries. |

## Settings

| Menu item | Route | Status | What it does |
|---|---|---|---|
| Setup Guide | `/settings/setup-guide` | ⬜ | Step-by-step company setup checklist. |
| Company | `/settings/company` | ✅ | Companies, projects and other company-wide lists. |
| Users & Access | `/settings/users-and-access` | ⬜ | Users, roles, authorizations and approval procedures. |
| Documents & Templates | `/settings/documents-and-templates` | ⬜ | Numbering series and print layouts. |
| Accounting & Tax | `/settings/accounting-and-tax` | ✅ | "Philippine VAT, percentage, withholding, compensation and excise taxes; currencies and BSP exchange rates." |
| Sales & CRM | `/settings/sales-and-crm` | ✅ | The lists the business partner form picks from. |
| Purchasing | `/settings/purchasing` | ⬜ | Purchasing defaults. |
| Inventory | `/settings/inventory` | ✅ | Item groups, units and UoM groups, manufacturers, customs and commission groups, shipping, warranties and item properties. |
| Banking | `/settings/banking` | ✅ | Payment terms, banks and other payment lists. |
| Operations | `/settings/operations` | ⬜ | Manufacturing, project and service settings. |
| Automation | `/settings/automation` | ⬜ | Alerts, workflows and recurring postings. |
| Data | `/settings/data` | ⬜ | Import, export and data cleanup. |
| Customization | `/settings/customization` | ⬜ | User-defined fields, tables and forms. |
| Apps & Integrations | `/settings/apps-and-integrations` | ⬜ | Connected apps and APIs. |
| Subscription | `/settings/subscription` | ⬜ | Plan and billing. |

### Settings › Company tabs

| Tab | What it does |
|---|---|
| Companies | Our own companies, switched in the top bar. Documents use the current company's address as ours (e.g. a service-only PO's Ship To). |
| Projects | Projects that documents can be tagged with. Partners default one onto their documents. |
| Technicians | Service technicians assigned to partners. |
| Planning groups | Groups for MRP and forecasting. |
| Countries | Countries used on addresses, banks and items' country of origin. |

### Settings › Accounting & Tax tabs

| Tab | What it does |
|---|---|
| Determination rules | Explains how a tax code is chosen for a document line, with a **Try it** simulator that traces the decision. |
| Company tax profile | Our own BIR tax status (VAT registration, TIN, etc.), used by tax determination. |
| Tax codes | VAT and percentage tax applied on document rows. Rates are kept with effective dates. |
| Tax groups | Default sales and purchase tax codes by kind of item (goods, services, capital goods, exempt…). The partner's or company's tax status can override them. |
| Withholding tax | BIR Alphanumeric Tax Codes (ATC): WE expanded, WF final, WV/WB government money payments (GMP) VAT/percentage. |
| Compensation tax | BIR revised withholding tables (daily to monthly) and annual tables. Payroll picks the table in force on the pay date. |
| Tax-free compensation | Exclusions from gross income and the minimum wage earner exemption, with annual caps. |
| De minimis benefits | De minimis benefits that aren't subject to withholding tax. |
| Withholding forms | BIR withholding forms and their filing and payment due dates. |
| Excise tax | Excise on top of VAT for sin and other covered products. Rates step up every January. |
| Currencies | Currencies that partners and documents can use. Books are in PHP. |
| Exchange rates | Daily rates, with **Import BSP Reference Exchange Rate Bulletin** (paste and parse) and per-currency rate history. |

### Settings › Sales & CRM tabs

| Tab | What it does |
|---|---|
| Business partner groups | Classify partners for reporting and filtering. Each group is for customers, vendors or leads. |
| Industries | A partner's industry, for segmentation and reports. |
| Sales employees & buyers | People assigned to partners. Defaults onto the partner's documents. |
| Territories | Sales territories, for territory-based reports. |
| Channels | How a partner buys from you. |
| Lead sources | Where a lead came from. |
| E-mail groups | Distribution groups for contact persons, used for bulk mailing. |
| Partner properties | Yes/no tags on partners for filtering and marketing lists. |

### Settings › Inventory tabs

| Tab | What it does |
|---|---|
| Item groups | Set an item's numbering prefix, valuation method, G/L accounts and tax defaults. |
| Units of measure | Units that items are stocked, bought and sold in. |
| UoM groups | Templates of related units and their conversions (e.g. 1 box = 24 pc). |
| Manufacturers | Who makes an item. This is separate from the vendor you buy it from. |
| Customs groups | Import duty by tariff heading, used for landed cost. |
| Commission groups | Sales commission % by item. |
| Shipping types | Delivery methods defaulted onto documents. |
| Warranty templates | Warranty terms for serial-numbered items. |
| Item properties | Yes/no flags for filtering items. |
| Inventory settings | Company-wide inventory defaults. |

### Settings › Banking tabs

| Tab | What it does |
|---|---|
| Payment terms | Default terms for partners. The days set document due dates. |
| Dunning terms | Schedules for dunning letters on overdue invoices. |
| Holiday calendars | Non-business days that due dates skip. |
| Banks | Banks that partners hold accounts with. |
| Bank charge allocation | Who bears bank transfer charges on payment runs. |
| Card brands | Credit card types. |
| Factoring companies | Third parties that receivables are sold to. |

---

## Record pages (submenus inside built pages)

### Item record

`/inventory/items/:id`. Views: Details · Transactions · Activity. **You can also:** Duplicate.

**Side column**

| Part | What it holds |
|---|---|
| **Item** section | Numbering (Auto from the group series, or Manual), Item No., Item type and Item group, plus the other identity fields. |
| **Warehouses** card | Stock per warehouse, with a default bin. Rows open a side panel. |
| **Vendors** card | Vendors you buy the item from. |
| **Manufacturers** card | Who makes the item. |

**Tabs**

| Tab | Sections |
|---|---|
| General | Usage · Valuation & G/L accounts · Trade & tax · Production · Validity |
| Units of measure | The item's units and conversions, with an **Add units from a UoM group** panel. |
| Purchasing | Purchasing unit · Import & tax |
| Sales data | Selling unit & price · Tax & commission · Fulfillment |
| Inventory data | Stock status · Inventory data · Cost & stock levels |
| Planning data | Planning · Order rules |
| Production data | Production. Warns when the item has no bill of materials yet. |
| Properties | Yes/no item properties. |
| Remarks | Free-text remarks. |
| Attachments | Files. |
| Barcodes | Barcodes per unit (must be unique). |

**Transactions view:** documents that reference the item.

### Business partner record

The URL is the role's list path plus `/:id` (for example `/business-partners/:id` or `/sales/customers/:id`). Views: Details · Transactions · Activity.

**You can also:** Duplicate, and **Convert to customer** (leads only).

**Side column**

| Part | What it holds |
|---|---|
| **Business partner** section | Numbering (Auto `BP-####` or Manual), Code (locked once added), Type, Name and roles. |
| **Contacts** card | Contact persons. Each opens a panel with Contact person and Defaults. |
| **Addresses** card | Bill-to and ship-to addresses (PSGC province → city → barangay). Each opens a panel with Address and Defaults. |
| **Payment methods** card | Bank accounts and cards. Each opens a panel with Payment method and Defaults. |
| **Attachments** card | Files. |

**Tabs**

| Tab | Sections |
|---|---|
| Settings | Classification · Assignment · Lead (leads only) · Credit & collection · Factoring · Delivery & checks · Consolidation · Dunning · Other. Also Terms & pricing, Control accounts and Properties. |
| Payment run | Payment run options. |
| Tax | Entity · Customer tax · Vendor tax. Also tax exemptions (with the Sworn Declaration of Gross Income) and tax-treaty income details for non-residents. |

**Transactions view:** the partner's documents and payments.

### Purchase order record

`/purchasing/purchase-orders/:id`. Views: Details · Transactions · Activity.

**You can also:**
- **Save as draft** (before the PO is added)
- **Approve**
- **Copy to goods receipt** and **Copy to A/P invoice** (open POs with quantity left to receive; billing straight from a PO receives the stock too)
- **Duplicate**
- **Close** (open POs)
- **Cancel purchase order** (open and not yet received)

**Side column**

| Part | What it holds |
|---|---|
| **Vendor** section | Vendor (with **New vendor** quick-create), contact and currency. |
| **Document** section | Series and No., Status, dates, and the close date. |

**Tabs**

| Tab | What it holds |
|---|---|
| Contents | Item or service lines with quantity, price, discount and tax code, plus a **Columns** chooser. |
| Logistics | Addresses (ship-to and bill-to, each editable in a panel) · Delivery |
| Accounting | Journal & payment · Dates & references · Referenced documents |

**Totals:** total before discount, document discount %, freight (with its tax code), tax, withholding, and net payment due. A warning appears for a duplicate vendor reference.

**Transactions view:** one **Related documents** table with the PO's whole chain of linked documents, in order. Base documents (← Base) come first, however far back, then the PO itself, then target documents (Target →), however far forward. Indirect links say which document they go through ("via …"). Today that means the PO's goods receipts. Purchase requests and RFQs will appear as bases once they're built.

### Goods receipt record

`/purchasing/goods-receipts/:id`. Views: Details · Transactions · Activity. Activity is a placeholder.

**Transactions view:** the same **Related documents** table, with the receipt's whole chain of linked documents. Bases are its PO and that PO's own bases. Targets will be A/P invoices and goods returns (and anything copied from those) once they're built. The links come from `src/pages/purchasing/shared/documentLinks.ts`. Registering a new document type there adds it to every chain.

**You can also:**
- **Save as draft** (before it's added)
- **Copy to A/P invoice** and **Copy to goods return** (open receipts with quantity left to bill)
- **Duplicate** (a new draft, unlinked from the POs)
- **Close** (open receipts)
- **Cancel goods receipt** (open receipts not yet billed or returned: the stock goes back out and the PO lines reopen)
- **Open PO …** for each base PO, and **Open vendor**

| Part | What it holds |
|---|---|
| **Vendor** section | Vendor (locked while lines from its POs are on the receipt), contact person, vendor ref. no. (their delivery receipt) and currency. |
| **Document** section | Series and No., Status, Posting date, Due date, Document date and Close date. |
| **Contents** | Lines with item, quantity and UoM, warehouse and bin, unit price, tax code, discount and total (LC). **Copy from PO** pulls in the open lines of the vendor's open POs at their open quantity. Optional columns: inventory-UoM quantity, no. of packages, open qty, price list, price after discount, base document, blanket agreement, line vendor, requisition slip no. and free text. |
| **Logistics** | Ship to (the company or a warehouse), Pay to (the vendor's address), shipping type. |
| **Accounting** | Journal remark, BP project, payment terms, payment method, cash discount offset, indicator, the vendor's TIN, the order number (base PO), and referenced documents. |
| **Totals** | Buyer, owner, total before discount, discount %, freight, rounding, tax, total payment due, and remarks. |
| **Journal entry** | Dr Inventory (or the cost account for non-stock items) and Freight-in / Cr 2025 Goods Received Not Invoiced, in PHP. |

**Adding a receipt** checks that no PO line receives more than it has open and that no item is frozen by an open count. It then:
- adds the stock to each line's warehouse and bin
- lowers Ordered for lines copied from a PO
- re-averages the item cost (except for Standard Price items)
- marks the PO lines received, closing the PO once every line is received

After that, only remarks can change.

### A/P invoice record

`/purchasing/bills/:id`. Views: Details · Transactions · Activity. Activity is a placeholder.

**Transactions view:** the **Related documents** table, with the invoice's whole chain of linked documents. That means the receipts and POs it billed, and the POs behind those receipts. Payments and credit memos will join once they're built.

**You can also:**
- **Save as draft** (before it's added)
- **Pay** (open bills with a balance and no payment block; opens an outgoing payment with this bill ticked)
- **Copy to goods return** (bills with stocked goods left to send back) and **Copy to A/P credit memo**
- **Duplicate** (a new draft, unlinked from its base documents)
- **Cancel A/P invoice** (open and unpaid: receipts reopen for billing, POs it received on reopen, stock it brought in goes back out)
- **Open receipt … / Open PO …** for each base document, and **Open vendor**

| Part | What it holds |
|---|---|
| **Vendor** section | Vendor, contact person, vendor ref. no. (their invoice no., checked for duplicates) and currency. |
| **Document** section | Series and No., Status, Posting date, Due date (from the payment terms), Document date and Close date. |
| **Contents** | Lines with item, quantity and UoM, unit price, tax code, discount and total (LC). **Copy from** pulls in the open lines of the vendor's goods receipts or open POs. Lines from a receipt show where they were received; other stocked lines pick a warehouse and bin, because the invoice receives them. Optional columns: inventory-UoM quantity, BP catalog no., country of origin, unit cost price, base document, blanket agreement and free text. |
| **Logistics** | Ship to, Pay to and shipping type (the same section as on receipts). |
| **Accounting** | Journal remark, control account (the vendor's payable account by default), payment terms, payment method, installments, cash discount offset, consolidating BP, BP project, indicator, the vendor's TIN, the order number (POs behind the lines), max. cash discount, and referenced documents. |
| **Totals** | Buyer, owner, total before discount, discount %, freight, rounding, tax, total payment due, withholding taken off (EWT, final tax), down payment, net payment due, applied amount and balance due. Also payment block, include in payment runs, and remarks. |
| **Journal entry** | Dr Goods Received Not Invoiced (lines from receipts) or Inventory / the cost account (other lines), Freight-in and Input VAT. Cr withholding tax payable and the vendor's control account. In PHP. |

**Price and exchange-rate differences:** a line from a receipt clears Goods Received Not Invoiced at the receipt's cost. If the bill's price or exchange rate differs, an alert shows the difference per line. It posts to inventory while the stock is on hand (re-averaging the item cost), to cost of sales once the stock is gone, or to the item's cost account for non-stock items. Realized FX gain or loss (7020 / 8020) comes when the bill is paid; see [Outgoing payment record](#outgoing-payment-record).

**Left out:** Item/Service type, Summary type, VAT code (the tax code is the VAT code here), Central Bank Ind., Stamp No., Net procedure, QR code, distribution rules, commodity classification and serial numbers. Down payments, installments and deferred tax wait for payments.

### Goods return record

`/purchasing/returns-and-debits/returns/:id`. Views: Details · Transactions · Activity. Transactions is the related-documents chain; Activity is a placeholder.

**You can also:** **Save as draft**, **Copy to A/P credit memo** (open returns with goods left to credit), **Cancel goods return** (not yet credited: the stock comes back in), **Open receipt / A/P invoice …** and **Open vendor**.

| Part | What it holds |
|---|---|
| **Vendor** section | Vendor, contact person, vendor ref. no. (their RMA) and currency. |
| **Document** section | Series and No., Status, Posting date, Due date, Document date and Close date. |
| **Contents** | Lines with item, quantity and UoM, warehouse and bin the goods leave from, unit price, tax code, discount, total (LC) and return reason. **Copy from** takes goods receipts (goods not yet billed) or A/P invoices (goods already billed). Optional columns: inventory-UoM quantity, country of origin, warranty, unit cost price, withholding code and rate with taxable amount, base document, blanket agreement and free text. |
| **Logistics** | Ship to (the vendor's return address), Pay to and shipping type. |
| **Accounting** | Journal remark, payment terms and method, cash discount offset, BP project, indicator, the vendor's TIN, order number and consolidating BP. |
| **Totals** | Buyer, owner, total before discount, discount %, tax and **Total credit**, plus remarks. |
| **Journal entry** | Dr Goods Received Not Invoiced / Cr Inventory (or the cost account for non-stock items), at the cost the goods came in at. |
| **Referenced documents** and **Attachments** | As on other documents. |

**What adding it does:** stock leaves the warehouse (it can't send back more than the warehouse holds, or items frozen by an open count). Lines from a receipt lower what's left to bill on it and close at once. Lines from a bill (or entered by hand) wait for an A/P credit memo, so the return stays **Open** until they're credited.

### A/P credit memo record

`/purchasing/returns-and-debits/credit-memos/:id`. Views: Details · Transactions · Activity.

**You can also:** **Save as draft**, **Apply credit to an invoice** (open memos with credit left; puts it against the vendor's other open bills), **Cancel credit memo** (takes the credit off the bills, brings returned goods back in, reopens the return), **Open A/P invoice / goods return …** and **Open vendor**.

| Part | What it holds |
|---|---|
| **Vendor** and **Document** sections | As on the bill; the vendor ref. no. is their credit note no. |
| **Contents** | As on the goods return, plus **Return goods** per line: send the goods back (stock out) or credit the price only. **Copy from** takes A/P invoices or goods returns. Lines from a return never move stock. |
| **Logistics** and **Accounting** | As on the bill, including the control account, payment block and max. cash discount. |
| **Totals** | Total before discount, discount, total down payment, tax, **Total credit**, the withholding reversed, **Net credit**, **Applied amount** and **Open balance**. Also payment block, payment run and remarks. |
| **Journal entry** | Dr the vendor and the withholding reversed / Cr Inventory (goods sent back, or price adjustments on stock still on hand; cost of sales once it's gone), Goods Received Not Invoiced (lines from a goods return), Freight-in and input VAT. |

**What adding it does:** goods marked to go back leave stock at the bill's cost, and price adjustments lower the item cost. Bill and return lines count what was returned or credited. The net credit goes to the bills it came from, up to their balances. A memo copied from a bill uses that bill's exchange rate, so it carries no exchange difference.

**Left out:** copying a credit memo from a goods receipt (an unbilled receipt owes nothing to credit, so use a goods return), using leftover credit in an outgoing payment, the client's custom print UDFs, serial numbers, distribution rules and the QR code.

### Outgoing payment record

`/purchasing/payments-made/:id` (Banking › Outgoing Payments in SAP). Views: Details · Transactions · Activity. Activity is a placeholder.

**Ways to start one:** **New outgoing payment**, **You can also › Pay** on a bill, or pick bills on a vendor's **Transactions** tab and press **Pay** (this replaced the old preview).

**You can also:** **Save as draft**, **Cancel payment** (posted payments: the bills it paid are open again and its checks are void), **Open A/P invoice …** and **Open vendor**.

| Part | What it holds |
|---|---|
| **Payee** section | Payment type (**Vendor** or **Account**). Vendor: vendor, pay to, contact person, currency (the vendor's), project. Account: to order of, pay to, doc. currency, project. |
| **Document** section | Series and No., Status (Draft / Posted / Cancelled), Posting date (sets the payment's exchange rate), Document date, Due date (the payment means' dates, weighted by amount) and Reference. |
| **Open documents** (Vendor) | The vendor's open A/P invoices in the payment currency, oldest due first. Columns: Document (* = overdue or blocked), Date, Overdue days, Total, WT amount, Balance due, Cash discount % and Total payment. A foreign-currency row also shows the rate it was booked at and the gain or loss at today's rate. Blocked invoices can't be ticked. |
| **Payment on account** (Vendor) | An amount not matched to any invoice, its control account, and **Pro forma** (a down payment to the vendor). |
| **Accounts** (Account) | G/L lines with account, doc. remarks, project and amount. |
| **Payment means** | Tabs for **Bank transfer** (account, amount, date, reference), **Cash** (cash fund, amount), **Check** (bank account, due date, manual check no. or numbered when added, endorsable, amount) and **Credit card** (card, account, voucher no., no. of payments, amount). A summary shows currency, overall amount, bank charge, paid and balance due, which must be 0. Each tab has **Pay the balance**. |
| **Remarks** | Journal remarks (default "Outgoing – vendor code") and remarks. |
| **Journal entry** | Dr the vendor for each invoice at the rate it was booked at (or Dr the G/L lines), Dr Bank Charges / Cr each payment means, Cr Purchase Discounts for cash discounts. The rest is **Dr 8020 Foreign Exchange Loss** or **Cr 7020 Foreign Exchange Gain**, called out in an alert with the per-invoice difference. |
| **Referenced documents** and **Attachments** | As on other documents. |

Adding the payment re-checks each bill's balance, numbers automatic checks per bank account (from the house bank's first check no.), and applies the amounts to the bills. A bill paid in full closes. Partial payments leave it open with its balance due.

**Left out:** the Customer type (refunds need A/R credit memos), endorsing incoming checks (no check register), the Payment Wizard, over/under-payment allowances, Checks for Payment (printing and voiding), and the journal entry's Transaction No. (journal entries aren't a module yet). House bank accounts aren't built either, so the bank accounts in the chart of accounts stand in for them.

### Inventory transfer record

`/inventory/stock-movements/:id`.

**You can also:**
- **Save as draft** (unposted)
- **Duplicate**
- **Transfer back** (posted, single destination)

| Part | What it holds |
|---|---|
| **Warehouses** section | From warehouse, To warehouse, the default To bin, and the value at cost. |
| **Document** section | No. and Status. |
| **Contents** | Lines with item, quantity, from bin, to warehouse and to bin. Each line can override the destination. |
| **Remarks** | Free text. |
| **Journal entry** | The resulting posting. |

### Stock count record

`/inventory/stock-counts/:id` (Inventory Counting) and `/inventory/stock-counts/postings/:id` (Inventory Posting).

**Inventory Counting — you can also:**
- **Copy to inventory posting** (open counts with counted lines; blocked while counters disagree)
- **Close without posting**
- **Duplicate as a recount** / **Recount variances only**

| Part | What it holds |
|---|---|
| **Document** section | No., Status, count date and time, Ref. 2, end of fiscal year. |
| **Counting** section | Counting type (single or multiple counters), the inventory counter(s) as User or Employee, referenced document. |
| **Summary** section | Lines counted, with variance, where counters differ, and frozen. |
| **Contents** | Find by item or warehouse, **Add Items** by warehouse and item group, **Adjust counted quantities**. Per line: item, description, Freeze, warehouse, In-Whse Qty on count date (snapshot), each counter's count, Counted, UoM counted qty, UoM code, Counted Qty and Variance. |
| **Attachments** | Count sheets and photos. |
| **Remarks** | Free text, including who approved the results. |

**Inventory Posting** — posting and count dates, time, price source (item cost or a price list), Ref. 2, the count it came from. Lines show In-Whse Qty, counted qty, variance and variance %, price and total, and stock after. Adding it moves stock by the variance, posts Dr 5050 / Cr Inventory (losses) or the reverse, and closes the count.

---

## Summary

| Hub | Pages | Built |
|---|---|---|
| Core (Home, Inbox, Business Partners) | 5 | 2 |
| CRM | 5 | 1 |
| Sales | 10 | 3 |
| Purchasing | 11 | 6 |
| Inventory | 8 | 6 |
| Manufacturing | 5 | 0 |
| Projects | 3 | 0 |
| Service | 4 | 0 |
| Banking | 7 | 0 |
| Accounting | 10 | 3 |
| People | 2 | 0 |
| Reports | 3 | 0 |
| Settings | 15 | 5 |
| **Total** | **88** | **26** |
