# Sikat ERP — UI prototype

A frontend-only prototype of Sikat ERP built on the
[Sikat design system](https://github.com/jasperlepardo/sikat-design-system).
There is no backend: screens read and write mock data through small async
"service" functions, and edits are saved to `localStorage`.

**Stack:** Vite · React 19 · TypeScript · React Router 7 · Tailwind CSS v4 (themed by the design system's tokens)

## Setup

The design system is published to **GitHub Packages**, which needs a token even for reads:

1. Create a **classic** GitHub personal access token with only the `read:packages` scope
   (GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)).
   Fine-grained tokens don't work with the npm registry.
2. Export it before installing. The repo's `.npmrc` reads `NODE_AUTH_TOKEN`:

   ```bash
   export NODE_AUTH_TOKEN=ghp_…   # add to your shell profile
   npm install
   npm run dev
   ```

| Command             | Does                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Start the dev server                    |
| `npm run build`     | Typecheck and build a static site to `dist/` |
| `npm run preview`   | Serve the built site locally            |
| `npm run typecheck` | Typecheck only                          |

The build is fully static and uses hash routing (`/#/inventory/items`), so `dist/` can be
hosted anywhere (GitHub Pages, Netlify, Vercel) with no rewrite rules.

## Project layout

```
src/
  app/
    AppShell.tsx   Navbar + SideNav + routed content (<Outlet />)
    nav.tsx        Sidebar hubs and pages (from the navigation architecture); a page's id is its route (/sales/invoices)
    router.tsx     Route table; unbuilt nav entries fall through to <Placeholder />
  components/form/ Shared master-data form pieces: field builders, "You can also" menu,
                   problems alert, attachments table, MasterList (editable settings lists),
                   DataTable (titled Card + Table for smaller tables)
  pages/           One folder per hub (Home, inventory/items/…, partners/…)
    inventory/items/ The item master; detail/ holds the form, one file per tab
    settings/accounting-tax/ Settings › Accounting & Tax: tax codes, tax groups, withholding,
                   excise, currencies and BSP exchange rates
    settings/inventory/ Settings › Inventory: item groups, units, manufacturers, customs and
                   commission groups, shipping types, warranties, item properties, units setting
    inventory/WarehousesPage.tsx Inventory › Warehouses & Bins
    partners/      Business partners: the Business Partners master lists every record;
                   CRM › Leads, Sales › Customers and Purchasing › Vendors are role views
                   of it. detail/ holds the master form, one file per tab
    accounting/    Accounting › Chart of Accounts
    purchasing/orders/ Purchasing › Purchase Orders: list, and detail/ with the header,
                   Contents / Logistics / Accounting tabs and the totals footer
  mocks/           Seed data and types
  services/        Fake async API over the mocks (store.ts; swap for fetch() later)
  index.css        Tailwind + the design system's token theme
  main.tsx         Loads the design system CSS, applies the saved theme, mounts the router
```

## Adding a screen

1. Create `src/pages/<hub>/<Screen>.tsx`. Compose it from design system parts:
   `Panel` + `PanelHeader` for the page frame, `Table` for lists, `Card` +
   `FormField` for forms.
2. Register its route in `src/app/router.tsx`, using the same path as the nav leaf's id
   in `src/app/nav.tsx` (for example, `sales/customers` or `purchasing/purchase-orders`).
3. If it needs data, add seed records to `src/mocks/` and a service in `src/services/`.

## Notes

- Fonts (DM Sans, Urbanist) and the Material Symbols icon font load from Google
  Fonts in `index.html`. The design system doesn't ship font files, and `<Icon>`
  needs Material Symbols.
- The design system's JS doesn't inject its CSS on its own, so `main.tsx` imports
  `@jasperlepardo/sikat-design-system/styles` explicitly.
- Theme: light, dark, or follow the OS. Switch it from the avatar menu.
- To reset the mock data, clear the `sikat-erp:*` keys in `localStorage`.
- Tax master data (Settings › Accounting & Tax) covers Philippine VAT (12%, zero-rated,
  exempt, government, importation, digital-services reverse charge), 3% percentage tax,
  expanded withholding tax ATCs, withholding VAT and excise categories. Rows marked
  "To confirm" / "Enter current rate" still need your accountant's check.
- Tax on a document line is decided by rules in `src/services/taxDetermination.ts`:
  company status (VAT-registered, top withholding agent) → item fixed code → partner
  status (government / zero-rated / exempt customer; non-VAT / non-resident supplier)
  → item tax group. Withholding comes from the vendor override, else the item's
  withholding category and the company's TWA status. Try it on the Determination
  rules tab. Tax codes keep effective-dated rates.
- Withholding tax holds the ATC tables from the BIR Withholding Tax page, verbatim
  (descriptions, conditions, rates and IND/CORP columns as published, typos included):
  WE expanded (109), WF final (32), WV GMP value added taxes (10) and WB GMP percentage
  taxes (28). Each tax type carries BIR's definition and forms. "Applicable to Government
  Withholding Agent Only" ATCs are marked and can't be picked as a vendor override.
  Non-resident digital services withhold VAT under WV070.
- Compensation tax, de minimis benefits and withholding forms (with eFPS / manual due dates)
  are also loaded verbatim from the BIR Withholding Tax page: the revised withholding tax
  tables (daily to monthly) and annual tax tables for 2018–2022 and 2023 onwards. The numbers
  used to calculate are parsed from BIR's own text on save, and the Compensation tax tab has
  a "Try it" calculator (e.g. monthly ₱50,000 in 2026 → ₱5,208.40).
  A vendor's "Gross income this year exceeds ₱3M / ₱720,000" flag picks the higher ATC of
  a pair: for professional fees from the rules, and for any income-tiered override
  (e.g. WC139 becomes WC140). Individuals who are VAT-registered always get the higher ATC.
- Exchange rates are PHP per unit from the BSP Reference Exchange Rate Bulletin. Paste
  the day's bulletin into "Import BSP bulletin"; the sample data holds the 30 Apr 2026
  (partial) and 25 Sep 2026 bulletins.
- Item fields follow the SAP B1 Item Master Data field map, localized (BIR VAT tax
  groups, PH warehouses). Seed items are marked as having transactions, which locks
  Item No., type, inventory UoM, tracking and valuation, as SAP does. Issue method
  and phantom show on both General and Production (same fields), and the Purchasing
  manufacturer is the main row on the Manufacturers tab. Master data the item picks
  from is editable; codes other records refer to lock once saved (deactivate instead).
- The sample business is an Apple Premium Reseller in the Philippines. The catalog is
  generated from product-family specs in `src/mocks/appleCatalog.ts`: one flat item per
  sellable configuration (model × size × chip/memory × storage × connectivity × colour),
  417 items as of 27 Sep 2026. There are no variants yet; each family becomes one parent
  item when they arrive. Macs use Apple's standard configurations (build-to-order is not
  itemised). Vision Pro and HomePod are left out: as far as we know Apple doesn't sell
  them in the PH (confirm).
  - Prices are VAT-inclusive PH SRPs. Only iPhone 18 Pro, 18 Pro Max and iPhone Duo use
    published Apple PH prices; the rest are estimated from US prices (× 79.2, calibrated
    on iPhone 18 Pro) and tagged with the "PH SRP to confirm" item property.
  - Apple part numbers, UPCs and reseller cost aren't public, so the Manufacturers and
    Barcodes tabs stay empty and item cost is a demo assumption (88% of the net SRP).
    Load the distributor's price file to fill them. Vendor bp-016 is a placeholder.
  - Devices are serial-tracked with the Apple one-year warranty. iPhone Duo is valid from
    23 Oct 2026, so it shows as a pre-order ("Not valid today"). AppleCare+ plans and store
    gift certificates are non-stock; gift certificates aren't VAT-liable at sale.
- The chart of accounts is a basic one for a VAT-registered Philippine retailer (123
  accounts, 4-digit codes) in SAP-style drawers: Assets, Liabilities, Equity, Revenue, Cost of
  sales, Operating expenses, Other income, Other expenses and Income tax. Title accounts
  group active accounts; control (AR/AP), cash and contra accounts are flagged. The G/L
  dropdowns on items, item groups, tax codes and business partners read the
  saved chart and store the account code: only active, postable accounts of the right kind are
  offered (contra accounts never), renames show everywhere, and an account still used by item
  groups, items, partners or tax codes can't be deactivated. The account page lists its usage.
  Each active account also carries reporting settings (account type, current/non-current,
  cash flow category, financial statement line), posting controls (block manual journal
  entries, valid from/to, required dimensions, confidential) and period-end/tax settings
  (revalue, bank reconciliation, default tax code). The seed fills them by rule; statement
  lines follow a PFRS for SMEs-style layout (STATEMENT_LINES), not an official template. There's
  no BIR ITR schedule mapping yet; load the official schedule lines to add one.
- Purchase orders follow the SAP B1 PO field map. Open points are settled as follows
  (see `src/mocks/purchaseOrders.ts`):
  - The vendor name is a snapshot taken when the vendor is picked.
  - Close date is set by the system on Close / Cancel.
  - Unticking Approved saves the PO as Not Confirmed.
  - Delivery date is required when adding.
  - Lines behave like the Manual UoM group: UoM name and items per unit are editable.
  - Return Reason is left out; it belongs to returns.
  - Document settings are fixed in `PURCHASING_SETTINGS`: net/gross price mode on,
    freight on, rounding by currency, multi-language off, duplicate vendor ref. = warn.
  - Split purchase order makes one PO per warehouse on Add.
  - Line tax codes come from the determination rules. A reverse-charge code (IVD12)
    isn't added to the amount due to the vendor.
  - Price lists aren't built: "Last purchase price" is the item cost; the other
    lists use the base price.
  - Items must be valid on the posting date, as in SAP. So iPhone Duo can't be ordered
    before its Valid From date (23 Oct 2026) unless that date moves earlier.
- Business partner fields follow the SAP B1 BP master field mapping, localized for
  the Philippines (TIN, barangay/province, GCash/Maya/PDC). Left out on purpose:
  portal passwords and card numbers (security), IBAN/SEPA mandate (EU-only), pager,
  factoring and country of birth. "Connected vendor" is unnecessary because one
  record can be both customer and vendor.
